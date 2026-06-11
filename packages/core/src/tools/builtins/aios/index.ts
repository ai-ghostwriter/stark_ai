import type { ToolDef } from "../../../llm/types.js";
import { getDailyBrief } from "./getDailyBrief.js";
import { queryMetrics } from "./queryMetrics.js";
import { getPipeline } from "./getPipeline.js";
import { searchIntel } from "./searchIntel.js";
import { planMyDay } from "./planMyDay.js";

export const aiosTools: ToolDef[] = [getDailyBrief, queryMetrics, getPipeline, searchIntel, planMyDay];
