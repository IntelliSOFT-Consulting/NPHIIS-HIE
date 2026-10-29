import express, { NextFunction, Request, Response } from "express";
import { authenticateUser } from "../lib/middleware";
import { findKeycloakUser } from "../lib/keycloak";
import { isAdminPractitioner } from "../lib/practitioner-role";
import { FhirApi } from "../lib/utils";
import { BUILT_IN_PROFILES, LEVELS, PERMISSIONS } from "../lib/permissions";
import {
    countProfileUsers,
    deleteProfile,
    getProfile,
    listProfiles,
    saveProfile,
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

router.delete("/:slug", authenticateUser, requireAdmin, async (req: Request, res: Response) => {
    try {
        const existing = await getProfile(req.params.slug);
        if (!existing) return res.status(404).json({ status: "error", error: "Profile not found" });
        const users = await countProfileUsers(existing.slug);
        if (users > 0) {
            return res.status(409).json({ status: "error", error: `${users} user(s) still have this profile; reassign them first` });
        }
        await deleteProfile(existing.slug);
        return res.status(200).json({ status: "success" });
    } catch (error) {
        console.error("DELETE /provider/profiles error:", error);
        return res.status(502).json({ status: "error", error: "Failed to delete profile" });
    }
});

export default router;
