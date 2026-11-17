import { Router } from "express";
import { templateV3, squadPreviewV3, rebuildRolesV3 } from "../controllers/matching-v3.controller";
import { requireAdmin } from "../middleware/auth.middleware";
const router = Router();
router.get("/template", templateV3);
router.post("/squad/preview", squadPreviewV3);
router.post("/roles/rebuild", requireAdmin, rebuildRolesV3);
export default router;
