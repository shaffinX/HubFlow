import { tool } from "@langchain/core/tools"
import type { RunnableConfig } from "@langchain/core/runnables"
import { z } from "zod"

import {
  createTask,
  deleteTask,
  getTask,
  HubSpotError,
  listContacts,
  listTasks,
  searchTasks,
  searchContacts,
  updateTask,
} from "@/lib/hubspot"
import { sendMail } from "@/lib/mailer"

// LangChain wraps this shape into function-calling schemas. Keep them minimal
// but expressive — every optional field the LLM might reach for should be
// present, or the model will invent one that HubSpot rejects.

const filterSchema = z.object({
  propertyName: z.string(),
  operator: z.enum([
    "EQ", "NEQ", "LT", "LTE", "GT", "GTE",
    "BETWEEN",
    "IN", "NOT_IN",
    "HAS_PROPERTY", "NOT_HAS_PROPERTY",
    "CONTAINS_TOKEN", "NOT_CONTAINS_TOKEN",
  ]),
  value: z.string().optional(),
  highValue: z.string().optional(),
  values: z.array(z.string()).optional(),
})

const sortSchema = z.object({
  propertyName: z.string(),
  direction: z.enum(["ASCENDING", "DESCENDING"]),
})

// Pull the resolved HubSpot access token out of the LangGraph runnable config.
// It's injected by the graph runner from the chat's bound credential.
function pullAccessToken(config: RunnableConfig | undefined): string {
  const token = config?.configurable?.accessToken as string | undefined
  if (!token) {
    throw new Error(
      "No HubSpot credential is configured for this chat. Save a token in Settings first.",
    )
  }
  return token
}

// HubSpot's own errors carry a message the model can reason about; anything
// else we serialise plainly. We keep the return value a plain string because
// LangChain's ToolMessage content is easier for smaller models when it's not
// a JSON blob.
function stringifyResult(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function stringifyError(error: unknown): string {
  if (error instanceof HubSpotError) {
    return `HubSpot error ${error.status}: ${error.message}`
  }
  return error instanceof Error ? error.message : String(error)
}

/* ------------------------------- READ tools ------------------------------- */

const listContactsTool = tool(
  async (input, config) => {
    try {
      const res = await listContacts({
        accessToken: pullAccessToken(config),
        limit: input.limit ?? 20,
        after: input.after,
      })
      return stringifyResult({
        results: res.results.map((c) => ({ id: c.id, properties: c.properties })),
        next: res.paging?.next?.after,
      })
    } catch (error) {
      return stringifyError(error)
    }
  },
  {
    name: "list_contacts",
    description:
      "Return the most recent HubSpot contacts with no filtering. Use this for open-ended requests like 'show me my contacts' or 'list contacts'. Use search_contacts only when the user is looking for a specific contact by name, email, or attribute.",
    schema: z.object({
      limit: z.number().optional(),
      after: z.string().optional().describe("Paging cursor from the previous response."),
    }),
  },
)

const searchContactsTool = tool(
  async (input, config) => {
    try {
      const res = await searchContacts({
        accessToken: pullAccessToken(config),
        query: input.query,
        filterGroups: input.filter_groups,
        properties: input.properties,
        limit: input.limit ?? 10,
      })
      return stringifyResult({
        total: res.total,
        results: res.results.map((c) => ({ id: c.id, properties: c.properties })),
      })
    } catch (error) {
      return stringifyError(error)
    }
  },
  {
    name: "search_contacts",
    description:
      "Search HubSpot contacts. Pass `query` for free-text (email/name) or `filter_groups` for structured filtering (e.g. email EQ, associations.company EQ). Returns contact IDs plus common properties.",
    schema: z.object({
      query: z.string().optional().describe("Free-text search across email, name, phone, company."),
      filter_groups: z
        .array(z.object({ filters: z.array(filterSchema) }))
        .optional()
        .describe("Structured filters. Groups OR'd, filters within a group AND'd."),
      properties: z.array(z.string()).optional(),
      limit: z.number().optional(),
    }),
  },
)

const getTaskTool = tool(
  async (input, config) => {
    try {
      const res = await getTask({ accessToken: pullAccessToken(config), taskId: input.task_id })
      return stringifyResult(res)
    } catch (error) {
      return stringifyError(error)
    }
  },
  {
    name: "get_task",
    description: "Fetch a single task by ID, including its properties and associations.",
    schema: z.object({ task_id: z.string() }),
  },
)

const listTasksTool = tool(
  async (input, config) => {
    try {
      const res = await listTasks({
        accessToken: pullAccessToken(config),
        limit: input.limit ?? 20,
        after: input.after,
      })
      return stringifyResult({
        results: res.results.map((t) => ({ id: t.id, properties: t.properties })),
        next: res.paging?.next?.after,
      })
    } catch (error) {
      return stringifyError(error)
    }
  },
  {
    name: "list_tasks",
    description:
      "List the most recent tasks with no filter. Use search_tasks for anything filtered.",
    schema: z.object({
      limit: z.number().optional(),
      after: z.string().optional(),
    }),
  },
)

const searchTasksTool = tool(
  async (input, config) => {
    try {
      const res = await searchTasks({
        accessToken: pullAccessToken(config),
        filterGroups: input.filter_groups,
        query: input.query,
        sorts: input.sorts,
        limit: input.limit ?? 20,
        after: input.after,
      })
      return stringifyResult({
        total: res.total,
        results: res.results.map((t) => ({ id: t.id, properties: t.properties })),
        next: res.paging?.next?.after,
      })
    } catch (error) {
      return stringifyError(error)
    }
  },
  {
    name: "search_tasks",
    description:
      "Search tasks with filters and sort. Use associations.contact EQ <id> to find tasks for one contact.",
    schema: z.object({
      filter_groups: z
        .array(z.object({ filters: z.array(filterSchema) }))
        .optional(),
      query: z.string().optional().describe("Free-text across hs_task_body and hs_task_subject."),
      sorts: z.array(sortSchema).optional().describe("Single sort rule allowed."),
      limit: z.number().optional(),
      after: z.string().optional(),
    }),
  },
)

/* ------------------------------- WRITE tools ------------------------------ */

const createTaskTool = tool(
  async (input, config) => {
    try {
      const res = await createTask({
        accessToken: pullAccessToken(config),
        dueDate: input.due_date,
        subject: input.subject,
        body: input.body,
        ownerId: input.owner_id,
        status: input.status,
        priority: input.priority,
        type: input.type,
        contactId: input.contact_id,
      })
      return stringifyResult({ id: res.id, properties: res.properties })
    } catch (error) {
      return stringifyError(error)
    }
  },
  {
    name: "create_task",
    description:
      "Create a task in HubSpot. Requires due_date (ISO 8601 UTC). Pass contact_id to auto-associate to a contact (uses HUBSPOT_DEFINED / 204).",
    schema: z.object({
      due_date: z
        .string()
        .describe("ISO 8601 UTC due date/time, e.g. '2026-08-15T09:00:00.000Z'."),
      subject: z.string().optional(),
      body: z.string().optional(),
      owner_id: z.string().optional(),
      status: z
        .enum(["NOT_STARTED", "IN_PROGRESS", "WAITING", "COMPLETED", "DEFERRED"])
        .optional(),
      priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
      type: z.enum(["TODO", "CALL", "EMAIL"]).optional(),
      contact_id: z.union([z.string(), z.number()]).optional(),
    }),
  },
)

const updateTaskTool = tool(
  async (input, config) => {
    try {
      const res = await updateTask({
        accessToken: pullAccessToken(config),
        taskId: input.task_id,
        subject: input.subject,
        body: input.body,
        dueDate: input.due_date,
        status: input.status,
        priority: input.priority,
        type: input.type,
      })
      return stringifyResult({ id: res.id, properties: res.properties })
    } catch (error) {
      return stringifyError(error)
    }
  },
  {
    name: "update_task",
    description: "Partial update of a task. Include only the fields you want to change.",
    schema: z.object({
      task_id: z.string(),
      subject: z.string().optional(),
      body: z.string().optional(),
      due_date: z.string().optional(),
      status: z
        .enum(["NOT_STARTED", "IN_PROGRESS", "WAITING", "COMPLETED", "DEFERRED"])
        .optional(),
      priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
      type: z.enum(["TODO", "CALL", "EMAIL"]).optional(),
    }),
  },
)

const deleteTaskTool = tool(
  async (input, config) => {
    try {
      const res = await deleteTask({ accessToken: pullAccessToken(config), taskId: input.task_id })
      return stringifyResult(res)
    } catch (error) {
      return stringifyError(error)
    }
  },
  {
    name: "delete_task",
    description:
      "Soft-delete a task (moves to HubSpot recycling bin, restorable for 30 days).",
    schema: z.object({ task_id: z.string() }),
  },
)

const sendEmailTool = tool(
  async (input) => {
    try {
      const res = await sendMail({
        to: input.to,
        subject: input.subject,
        body: input.body,
        heading: input.heading,
        ctaLabel: input.cta_label,
        ctaUrl: input.cta_url,
        preheader: input.preheader,
      })
      return stringifyResult({
        messageId: res.messageId,
        accepted: res.accepted,
        rejected: res.rejected,
      })
    } catch (error) {
      return stringifyError(error)
    }
  },
  {
    name: "send_email",
    description:
      "Send a HubFlow-branded email over SMTP. Use for follow-ups, confirmations, outreach. Independent of HubSpot.",
    schema: z.object({
      to: z.string().describe("Recipient email address."),
      subject: z.string(),
      body: z.string().describe("Plain-text body. Blank lines become paragraphs."),
      heading: z.string().optional().describe("Big heading above the body."),
      cta_label: z.string().optional(),
      cta_url: z.string().optional(),
      preheader: z.string().optional().describe("Inbox preview text (~120 chars)."),
    }),
  },
)

/* ------------------------------- Registry --------------------------------- */

export const AGENT_TOOLS = [
  listContactsTool,
  searchContactsTool,
  getTaskTool,
  listTasksTool,
  searchTasksTool,
  createTaskTool,
  updateTaskTool,
  deleteTaskTool,
  sendEmailTool,
]

// Tool names that need explicit user approval before executing.
export const WRITE_TOOL_NAMES = new Set([
  "create_task",
  "update_task",
  "delete_task",
  "send_email",
])

export function isWriteTool(name: string): boolean {
  return WRITE_TOOL_NAMES.has(name)
}
