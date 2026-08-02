import { hubspotFetch } from "./client"
import type { HubSpotListResponse, HubSpotSearchResponse, SearchFilter, SearchSort } from "./tasks"

export const DEFAULT_CONTACT_PROPERTIES = [
  "email",
  "firstname",
  "lastname",
  "phone",
  "company",
  "hubspot_owner_id",
  "lifecyclestage",
  "createdate",
  "lastmodifieddate",
  "hs_object_id",
] as const

export interface HubSpotContact {
  id: string
  properties: Record<string, string | null>
  createdAt: string
  updatedAt: string
  archived: boolean
}

interface ListContactsInput {
  accessToken: string
  limit?: number
  after?: string
  properties?: string[]
  archived?: boolean
}

export async function listContacts(
  input: ListContactsInput,
): Promise<HubSpotListResponse<HubSpotContact>> {
  const properties = (input.properties ?? DEFAULT_CONTACT_PROPERTIES).join(",")
  return hubspotFetch<HubSpotListResponse<HubSpotContact>>({
    accessToken: input.accessToken,
    path: "/crm/v3/objects/contacts",
    query: {
      limit: input.limit ?? 100,
      after: input.after,
      properties,
      archived: input.archived ?? false,
    },
  })
}

interface SearchContactsInput {
  accessToken: string
  filterGroups?: Array<{ filters: SearchFilter[] }>
  query?: string
  properties?: string[]
  sorts?: SearchSort[]
  limit?: number
  after?: string
}

export async function searchContacts(
  input: SearchContactsInput,
): Promise<HubSpotSearchResponse<HubSpotContact>> {
  return hubspotFetch<HubSpotSearchResponse<HubSpotContact>>({
    accessToken: input.accessToken,
    method: "POST",
    path: "/crm/v3/objects/contacts/search",
    body: {
      filterGroups: input.filterGroups ?? [],
      query: input.query,
      properties: input.properties ?? DEFAULT_CONTACT_PROPERTIES,
      sorts: input.sorts,
      limit: input.limit ?? 100,
      after: input.after,
    },
  })
}
