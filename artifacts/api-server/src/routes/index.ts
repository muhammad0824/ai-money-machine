import { Router, type IRouter } from "express";
import healthRouter from "./health";
import graphRouter from "./graph";
import manualRouter from "./manual";
import pipelineStatusRouter from "./rss/status";

const router: IRouter = Router();

router.use(healthRouter);
router.use(graphRouter);
router.use(manualRouter);
router.use(pipelineStatusRouter);

export default router;
