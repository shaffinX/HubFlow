import {
  hubspotFetch,
  TASK_TO_CONTACT_ASSOCIATION_CATEGORY,
  TASK_TO_CONTACT_ASSOCIATION_TYPE_ID,
} from "./client"

export type TaskStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "WAITING"
  | "COMPLETED"
  | "DEFERRED"

export type TaskPriority = "LOW" | "MEDIUM" | "HIGH"
export type TaskType = "TODO" | "CALL" | "EMAIL"

// Fields we round-trip by default. The agent can override via `properties` on
// read-shaped tools when it wants something exotic (e.g. custom properties).
export const DEFAULT_TASK_PROPERTIES = [
  "hs_timestamp",
  "hs_task_subject",
  "hs_task_body",
  "hs_task_status",
  "hs_task_priority",
  "hs_task_type",
  "hs_task_reminders",
  "hubspot_owner_id",
  "hs_created_by_user_id",
  "hs_createdate",
  "hs_lastmodifieddate",
  "hs_object_id",
  "hs_queue_membership_ids",
  "hs_task_completion_date",
  "hs_task_is_completed",
  "hs_body_preview",
] as const

export interface HubSpotTask {
  id: string
  properties: Record<string, string | null>
  associations?: Record<string, { results: Array<{ id: string; type: string }> }>
  createdAt: string
  updatedAt: string
  archived: boolean
}

interface CreateTaskInput {
  accessToken: string
  subject?: string
  body?: string
  // ISO 8601 UTC or Unix ms as string. Required by HubSpot.
  dueDate: string
  ownerId?: string
  status?: TaskStatus
  priority?: TaskPriority
  type?: TaskType
  reminderAt?: string // Unix ms only (HubSpot rejects ISO here)
  queueMembershipIds?: string
  // If provided, task is auto-associated to this contact using
  // HUBSPOT_DEFINED / 204 (task -> contact).
  contactId?: string | number
  // Escape hatch for callers that need to link something other than a contact.
  extraAssociations?: Array<{
    toId: string | number
    associationCategory?: "HUBSPOT_DEFINED" | "USER_DEFINED"
    associationTypeId: number
  }>
}

export async function createTask(input: CreateTaskInput): Promise<HubSpotTask> {
  const properties: Record<string, string> = { hs_timestamp: input.dueDate }
  if (input.subject !== undefined) properties.hs_task_subject = input.subject
  if (input.body !== undefined) properties.hs_task_body = input.body
  if (input.ownerId !== undefined) properties.hubspot_owner_id = String(input.ownerId)
  if (input.status !== undefined) properties.hs_task_status = input.status
  if (input.priority !== undefined) properties.hs_task_priority = input.priority
  if (input.type !== undefined) properties.hs_task_type = input.type
  if (input.reminderAt !== undefined) properties.hs_task_reminders = input.reminderAt
  if (input.queueMembershipIds !== undefined)
    properties.hs_queue_membership_ids = input.queueMembershipIds

  const associations: Array<{
    to: { id: string | number }
    types: Array<{ associationCategory: string; associationTypeId: number }>
  }> = []

  if (input.contactId !== undefined && input.contactId !== null) {
    associations.push({
      to: { id: input.contactId },
      types: [
        {
          associationCategory: TASK_TO_CONTACT_ASSOCIATION_CATEGORY,
          associationTypeId: TASK_TO_CONTACT_ASSOCIATION_TYPE_ID,
        },
      ],
    })
  }

  for (const extra of input.extraAssociations ?? []) {
    associations.push({
      to: { id: extra.toId },
      types: [
        {
          associationCategory: extra.associationCategory ?? "HUBSPOT_DEFINED",
          associationTypeId: extra.associationTypeId,
        },
      ],
    })
  }

  return hubspotFetch<HubSpotTask>({
    accessToken: input.accessToken,
    method: "POST",
    path: "/crm/v3/objects/tasks",
    body: { properties, associations },
  })
}

interface GetTaskInput {
  accessToken: string
  taskId: string
  properties?: string[]
  associations?: string[]
  archived?: boolean
}

export async function getTask(input: GetTaskInput): Promise<HubSpotTask> {
  const properties = (input.properties ?? DEFAULT_TASK_PROPERTIES).join(",")
  const associations = (input.associations ?? ["contacts", "companies", "deals", "tickets"]).join(",")
  return hubspotFetch<HubSpotTask>({
    accessToken: input.accessToken,
    path: `/crm/v3/objects/tasks/${encodeURIComponent(input.taskId)}`,
    query: {
      properties,
      associations,
      archived: input.archived ?? false,
    },
  })
}

interface ListTasksInput {
  accessToken: string
  limit?: number
  after?: string
  properties?: string[]
  associations?: string[]
  archived?: boolean
}

export interface HubSpotListResponse<T> {
  results: T[]
  paging?: { next?: { after: string; link?: string } }
}

export async function listTasks(input: ListTasksInput): Promise<HubSpotListResponse<HubSpotTask>> {
  const properties = (input.properties ?? DEFAULT_TASK_PROPERTIES).join(",")
  const associations = (input.associations ?? ["contacts"]).join(",")
  return hubspotFetch<HubSpotListResponse<HubSpotTask>>({
    accessToken: input.accessToken,
    path: "/crm/v3/objects/tasks",
    query: {
      limit: input.limit ?? 100,
      after: input.after,
      properties,
      associations,
      archived: input.archived ?? false,
    },
  })
}

export interface SearchFilter {
  propertyName: string
  operator:
    | "EQ"
    | "NEQ"
    | "LT"
    | "LTE"
    | "GT"
    | "GTE"
    | "BETWEEN"
    | "IN"
    | "NOT_IN"
    | "HAS_PROPERTY"
    | "NOT_HAS_PROPERTY"
    | "CONTAINS_TOKEN"
    | "NOT_CONTAINS_TOKEN"
  value?: string
  highValue?: string
  values?: string[]
}

export interface SearchSort {
  propertyName: string
  direction: "ASCENDING" | "DESCENDING"
}

interface SearchTasksInput {
  accessToken: string
  filterGroups?: Array<{ filters: SearchFilter[] }>
  query?: string
  properties?: string[]
  sorts?: SearchSort[]
  limit?: number
  after?: string
}

export interface HubSpotSearchResponse<T> {
  total: number
  results: T[]
  paging?: { next?: { after: string } }
}

export async function searchTasks(
  input: SearchTasksInput,
): Promise<HubSpotSearchResponse<HubSpotTask>> {
  return hubspotFetch<HubSpotSearchResponse<HubSpotTask>>({
    accessToken: input.accessToken,
    method: "POST",
    path: "/crm/v3/objects/tasks/search",
    body: {
      filterGroups: input.filterGroups ?? [],
      query: input.query,
      properties: input.properties ?? DEFAULT_TASK_PROPERTIES,
      sorts: input.sorts,
      limit: input.limit ?? 100,
      after: input.after,
    },
  })
}

interface UpdateTaskInput {
  accessToken: string
  taskId: string
  subject?: string
  body?: string
  dueDate?: string
  ownerId?: string
  status?: TaskStatus
  priority?: TaskPriority
  type?: TaskType
  reminderAt?: string
  queueMembershipIds?: string
  // Extra properties passthrough for custom or less-common HubSpot fields.
  properties?: Record<string, string | null>
}

export async function updateTask(input: UpdateTaskInput): Promise<HubSpotTask> {
  const properties: Record<string, string | null> = { ...(input.properties ?? {}) }
  if (input.subject !== undefined) properties.hs_task_subject = input.subject
  if (input.body !== undefined) properties.hs_task_body = input.body
  if (input.dueDate !== undefined) properties.hs_timestamp = input.dueDate
  if (input.ownerId !== undefined) properties.hubspot_owner_id = input.ownerId
  if (input.status !== undefined) properties.hs_task_status = input.status
  if (input.priority !== undefined) properties.hs_task_priority = input.priority
  if (input.type !== undefined) properties.hs_task_type = input.type
  if (input.reminderAt !== undefined) properties.hs_task_reminders = input.reminderAt
  if (input.queueMembershipIds !== undefined)
    properties.hs_queue_membership_ids = input.queueMembershipIds

  return hubspotFetch<HubSpotTask>({
    accessToken: input.accessToken,
    method: "PATCH",
    path: `/crm/v3/objects/tasks/${encodeURIComponent(input.taskId)}`,
    body: { properties },
  })
}

interface DeleteTaskInput {
  accessToken: string
  taskId: string
}

// Soft-deletes (archives) the task in HubSpot. Returns nothing on success (204).
export async function deleteTask(input: DeleteTaskInput): Promise<{ archived: true; id: string }> {
  await hubspotFetch<void>({
    accessToken: input.accessToken,
    method: "DELETE",
    path: `/crm/v3/objects/tasks/${encodeURIComponent(input.taskId)}`,
  })
  return { archived: true, id: input.taskId }
}
