import { randomUUID } from "crypto";
import express, { NextFunction, Request, Response } from "express";
import { authenticateUser } from "../lib/middleware";
import { findKeycloakUser, setKeycloakUserAttributes } from "../lib/keycloak";
import { isAdminPractitioner, providerRoleKeycloakAttributes, resolvePractitionerAssignment, syncPractitionerRoleAndExtensions } from "../lib/practitioner-role";
import { FhirApi } from "../lib/utils";
import { BUILT_IN_PROFILES, LEVELS, Level, PERMISSIONS } from "../lib/permissions";
import {
    PROFILE_USER_ATTRIBUTE,
    MigrationTarget,
    compatRole,
    deleteProfile,
    getProfile,
    listProfileUsers,
    listProfiles,
    parseMigrationTarget,
    runForEach,
    saveProfile,
    setUserProfileRole,
    slugify,
    validateProfileInput,
} from "../lib/profiles";

const router = express.Router();
router.use(express.json({ limit: "100kb" }));

async function requireAdmin(req: Request, res: Response, next: NextFunction) {
    try {
        const user = await findKeycloakUser((req as any).user?.preferred_username);
        const practitioner = user?.id ? (await FhirApi({ url: `/Practitioner/${user.id}` })).data : null;
        if (!user?.id || !(await isAdminPractitioner(user.id, practitioner))) {
            return res.status(403).json({ status: "error", error: "Only administrators can manage profiles" });
        }
        next();
    } catch (error) {
        console.error("profiles admin check failed:", error);
        return res.status(500).json({ status: "error", error: "Failed to verify access" });
    }
}

/** Levels, the permission list, the built-in role profiles and the profiles created in the portal. */
router.get("/", authenticateUser, async (_req: Request, res: Response) => {
    try {
        return res.status(200).json({
            status: "success",
            levels: LEVELS,
            permissions: Object.entries(PERMISSIONS).map(([key, label]) => ({ key, label })),
            builtIn: Object.entries(BUILT_IN_PROFILES).map(([role, p]) => ({ role, ...p })),
            profiles: await listProfiles(),
        });
    } catch (error) {
        console.error("GET /provider/profiles error:", error);
        return res.status(502).json({ status: "error", error: "Failed to load profiles" });
    }
});

router.post("/", authenticateUser, requireAdmin, async (req: Request, res: Response) => {
    try {
        const parsed = validateProfileInput(req.body ?? {});
        if (!parsed.ok) return res.status(400).json({ status: "error", errors: parsed.errors });
        const slug = slugify(parsed.value.name);
        if (await getProfile(slug)) return res.status(409).json({ status: "error", error: "A profile with this name already exists" });
        await saveProfile(slug, parsed.value, true);
        return res.status(201).json({ status: "success", profile: { slug, ...parsed.value } });
    } catch (error) {
        console.error("POST /provider/profiles error:", error);
        return res.status(502).json({ status: "error", error: "Failed to save profile" });
    }
});

/** Change a profile's permissions or level; the name (and so the slug) is fixed once created. */
router.put("/:slug", authenticateUser, requireAdmin, async (req: Request, res: Response) => {
    try {
        const existing = await getProfile(req.params.slug);
        if (!existing) return res.status(404).json({ status: "error", error: "Profile not found" });
        const parsed = validateProfileInput({ ...req.body, name: existing.name });
        if (!parsed.ok) return res.status(400).json({ status: "error", errors: parsed.errors });
        await saveProfile(existing.slug, parsed.value, false);
        return res.status(200).json({ status: "success", profile: { slug: existing.slug, ...parsed.value } });
    } catch (error) {
        console.error("PUT /provider/profiles error:", error);
        return res.status(502).json({ status: "error", error: "Failed to save profile" });
    }
});

/** In-memory record of delete-and-migrate jobs, for the portal to poll. Lost on restart. */
interface MigrationJob {
    id: string;
    slug: string;
    total: number;
    done: number;
    failed: number;
    state: "running" | "done" | "failed";
    error?: string;
}
const jobs = new Map<string, MigrationJob>();

/** Moves one user to the target; the profile being deleted is dropped from them. */
async function moveUser(userId: string, from: string, target: MigrationTarget, targetLevel: Level, currentRole: string | null) {
    if (target.kind === "profile") {
        // Same level, so the user's assigned role (the level's existing role) stays valid.
        await setUserProfileRole(userId, from, target.slug);
        await setKeycloakUserAttributes(userId, { [PROFILE_USER_ATTRIBUTE]: [target.slug] });
        return;
    }
    await setUserProfileRole(userId, from, undefined);
    const assignment = await resolvePractitionerAssignment(userId);
    const role = target.role;
    if (assignment?.locationReference && role !== (assignment.role ?? currentRole)) {
        const id = assignment.locationReference.replace(/^Location\//, "");
        await syncPractitionerRoleAndExtensions(userId, role, { id, name: assignment.locationDisplay ?? undefined });
    }
    await setKeycloakUserAttributes(userId, {
        ...providerRoleKeycloakAttributes(userId, role),
        [PROFILE_USER_ATTRIBUTE]: [""],
    });
    void targetLevel;
}

/**
 * Delete a profile. With users still on it, `migrateTo` ("profile:<SLUG>" or "role:<ROLE>", same
 * level) is required: the users are moved in the background (202 + a job to poll) and the profile
 * is deleted only once every user has moved.
 */
router.delete("/:slug", authenticateUser, requireAdmin, async (req: Request, res: Response) => {
    try {
        const existing = await getProfile(req.params.slug);
        if (!existing) return res.status(404).json({ status: "error", error: "Profile not found" });
        const users = await listProfileUsers(existing.slug);
        if (users.length === 0) {
            await deleteProfile(existing.slug);
            return res.status(200).json({ status: "success" });
        }

        const target = parseMigrationTarget(req.query.migrateTo ?? req.body?.migrateTo);
        if (!target) {
            return res.status(409).json({
                status: "error",
                requiresTarget: true,
                users: users.length,
                error: `${users.length} user(s) have this profile; choose a new role for them (migrateTo)`,
            });
        }
        let targetLevel: Level | undefined;
        if (target.kind === "profile") {
            if (target.slug === existing.slug) return res.status(400).json({ status: "error", error: "Choose a different profile" });
            targetLevel = (await getProfile(target.slug))?.level;
        } else {
            targetLevel = BUILT_IN_PROFILES[target.role]?.level;
        }
        if (!targetLevel) return res.status(400).json({ status: "error", error: "Unknown target role or profile" });
        if (targetLevel !== existing.level) {
            return res.status(400).json({
                status: "error",
                error: `The new role must be at the same level (${existing.level}) so users keep a valid location`,
            });
        }

        const job: MigrationJob = { id: randomUUID(), slug: existing.slug, total: users.length, done: 0, failed: 0, state: "running" };
        jobs.set(job.id, job);
        void (async () => {
            try {
                const result = await runForEach(
                    users,
                    (u) => moveUser(u.id, existing.slug, target, targetLevel!, compatRole(existing.level)),
                    (done, failed) => Object.assign(job, { done, failed }),
                );
                if (result.failed.length) {
                    job.state = "failed";
                    job.error = `${result.failed.length} user(s) could not be moved; the profile was kept. Retry the delete.`;
                    return;
                }
                await deleteProfile(existing.slug);
                job.state = "done";
            } catch (error) {
                job.state = "failed";
                job.error = (error as Error).message;
            }
        })();
        return res.status(202).json({ status: "success", job });
    } catch (error) {
        console.error("DELETE /provider/profiles error:", error);
        return res.status(502).json({ status: "error", error: "Failed to delete profile" });
    }
});

router.get("/jobs/:id", authenticateUser, requireAdmin, (req: Request, res: Response) => {
    const job = jobs.get(req.params.id);
    return job ? res.status(200).json({ status: "success", job }) : res.status(404).json({ status: "error", error: "Job not found" });
});

export default router;
