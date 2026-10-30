import express, { Request, Response } from "express";
import { authenticateUser } from "../lib/middleware";
import {
    clearPermissionProfileCache,
    deletePermissionProfile,
    getPermissionProfile,
    listPermissionProfiles,
    savePermissionProfile,
    validatePermissionProfileInput,
} from "../lib/permission-profiles";
import { clearProfileCache, listProfiles, slugify } from "../lib/profiles";
import { requireAdmin } from "./profiles";

/** Permission profiles: what a job function can do, at any level. Roles are built from them. */
const router = express.Router();
router.use(express.json({ limit: "100kb" }));

router.post("/", authenticateUser, requireAdmin, async (req: Request, res: Response) => {
    try {
        const parsed = validatePermissionProfileInput(req.body ?? {});
        if (!parsed.ok) return res.status(400).json({ status: "error", errors: parsed.errors });
        const slug = slugify(parsed.value.name);
        if (await getPermissionProfile(slug)) return res.status(409).json({ status: "error", error: "A profile with this name already exists" });
        await savePermissionProfile(slug, parsed.value, true);
        return res.status(201).json({ status: "success", profile: { slug, ...parsed.value } });
    } catch (error) {
        console.error("POST /provider/permission-profiles error:", error);
        return res.status(502).json({ status: "error", error: "Failed to save profile" });
    }
});

/** Change a profile's permissions; every role built on it follows (the name is fixed). */
router.put("/:slug", authenticateUser, requireAdmin, async (req: Request, res: Response) => {
    try {
        const existing = await getPermissionProfile(req.params.slug);
        if (!existing) return res.status(404).json({ status: "error", error: "Profile not found" });
        const parsed = validatePermissionProfileInput({ ...req.body, name: existing.name });
        if (!parsed.ok) return res.status(400).json({ status: "error", errors: parsed.errors });
        await savePermissionProfile(existing.slug, parsed.value, false);
        clearProfileCache();
        return res.status(200).json({ status: "success", profile: { slug: existing.slug, ...parsed.value } });
    } catch (error) {
        console.error("PUT /provider/permission-profiles error:", error);
        return res.status(502).json({ status: "error", error: "Failed to save profile" });
    }
});

/** A profile roles are built on cannot be deleted; delete or move those roles first. */
router.delete("/:slug", authenticateUser, requireAdmin, async (req: Request, res: Response) => {
    try {
        const existing = await getPermissionProfile(req.params.slug);
        if (!existing) return res.status(404).json({ status: "error", error: "Profile not found" });
        clearProfileCache();
        const roles = (await listProfiles()).filter((r) => r.profile === `custom:${existing.slug}`);
        if (roles.length) {
            return res.status(409).json({
                status: "error",
                error: `${roles.length} role(s) use this profile (${roles.map((r) => r.name).join(", ")}); delete or change them first`,
                roles: roles.map((r) => r.name),
            });
        }
        await deletePermissionProfile(existing.slug);
        clearPermissionProfileCache();
        return res.status(200).json({ status: "success" });
    } catch (error) {
        console.error("DELETE /provider/permission-profiles error:", error);
        return res.status(502).json({ status: "error", error: "Failed to delete profile" });
    }
});

export default router;
