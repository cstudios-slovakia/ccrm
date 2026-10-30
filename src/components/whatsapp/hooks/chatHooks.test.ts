import assert from "node:assert/strict";
import test from "node:test";
import { REQUIRED_WAAI_API, WaaiClient } from "../api/waaiClient.ts";
import type {
  ChatCrmLinks,
  CrmEntitiesResponse,
  SummaryLookupResponse,
  SummaryStreamEvent,
  TaskDto,
  TaskUpdateResponse,
} from "../api/contract.ts";

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | FormData | undefined;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

function setupMockClient(handler: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const client = new WaaiClient({
    base: "/waai-api",
    fetchSsoToken: async () => "sso-token-test",
    fetch: async (input, init) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      const call: Call = {
        url: String(input),
        method: init?.method ?? "GET",
        headers,
        body: init?.body instanceof FormData ? init.body : typeof init?.body === "string" ? init.body : undefined,
      };
      calls.push(call);
      if (call.method === "POST" && call.url.endsWith("/session")) {
        return json(200, {
          access_token: "wam_test_token",
          expires_in: 3600,
          api_version: REQUIRED_WAAI_API,
          user: { id: "u1", role: "member", name: "test@example.sk", crm_user_id: "crm-1" },
        });
      }
      return handler(call);
    },
  });

  return { client, calls };
}

test("summary endpoints: GET lookup and POST stream", async () => {
  const mockSummary: SummaryLookupResponse = {
    cached: true,
    message_count: 14,
    summary: {
      id: "sum-1",
      window: "today",
      from_at: "2026-10-30T00:00:00.000Z",
      to_at: "2026-10-30T23:59:59.000Z",
      message_count: 14,
      narrative: "Discussion about project budget and deliverables.",
      model: "gpt-4o",
      created_at: "2026-10-30T10:00:00.000Z",
      tasks: [],
      audio_url: "/media/summary-audio/sum-1",
    },
  };

  const { client, calls } = setupMockClient((call) => {
    if (call.method === "GET" && call.url.includes("/conversations/c1/summary")) {
      assert.ok(call.url.includes("window=today"));
      return json(200, mockSummary);
    }
    if (call.method === "POST" && call.url.includes("/conversations/c1/summary")) {
      return new Response('event: delta\ndata: {"delta":"Summary text"}\n\n', {
        headers: { "content-type": "text/event-stream" },
      });
    }
    return json(404, { error: "not found" });
  });

  const res = await client.get<SummaryLookupResponse>("/conversations/c1/summary", {
    query: { window: "today" },
  });
  assert.equal(res.cached, true);
  assert.equal(res.summary?.narrative, "Discussion about project budget and deliverables.");

  const events: string[] = [];
  await client.stream(
    "/conversations/c1/summary",
    (e) => events.push(e.data),
    { body: { window: "today", regenerate: true } },
  );
  assert.equal(events.length, 1);
  assert.ok(events[0]?.includes("Summary text"));
});

test("tasks endpoints: GET list and PATCH status toggle", async () => {
  const sampleTask: TaskDto = {
    id: "t-1",
    title: "Review quotation",
    description: "Check the numbers on page 2",
    assignee: "Peter",
    assignee_contact_id: null,
    start_at: null,
    due_at: "2026-11-05T12:00:00.000Z",
    status: "open",
    completed_at: null,
    notified_at: null,
    created_at: "2026-10-30T09:00:00.000Z",
    conversation_id: "c1",
    source_message_id: "m-100",
    conversation_title: "Client ABC",
    is_group: false,
    origin: "waai",
    crm_sync_state: "none",
    crm_state: null,
    crm_error: null,
    crm_task_id: null,
    crm_linked: false,
    attachments: [],
  };

  const { client } = setupMockClient((call) => {
    if (call.method === "GET" && call.url.includes("/tasks")) {
      assert.ok(call.url.includes("conversationId=c1"));
      return json(200, { tasks: [sampleTask] });
    }
    if (call.method === "PATCH" && call.url.includes("/tasks/t-1")) {
      const parsed = JSON.parse(call.body as string);
      assert.equal(parsed.status, "completed");
      return json(200, { ...sampleTask, status: "completed", completed_at: new Date().toISOString() });
    }
    return json(404, {});
  });

  const list = await client.get<{ tasks: TaskDto[] }>("/tasks", { query: { conversationId: "c1" } });
  assert.equal(list.tasks.length, 1);
  assert.equal(list.tasks[0]?.id, "t-1");

  const updated = await client.patch<TaskDto>("/tasks/t-1", { status: "completed" });
  assert.equal(updated.status, "completed");
});

test("CRM link endpoints: GET links, PUT link, GET entities search", async () => {
  const mockLinks: ChatCrmLinks = {
    supported: true,
    links: [
      {
        entity_type: "project",
        crm_id: "proj-101",
        name: "Website Redesign",
        url: "/projects/proj-101",
        source: "auto",
      },
    ],
    ambiguous: null,
  };

  const mockEntities: CrmEntitiesResponse = {
    entities: [
      {
        entity_type: "lead",
        crm_id: "lead-202",
        name: "New Lead Peter",
        url: "/leads/lead-202",
      },
    ],
  };

  const { client } = setupMockClient((call) => {
    if (call.method === "GET" && call.url.includes("/conversations/c1/crm-links")) {
      return json(200, mockLinks);
    }
    if (call.method === "PUT" && call.url.includes("/conversations/c1/crm-links")) {
      const body = JSON.parse(call.body as string);
      assert.equal(body.entity_type, "lead");
      assert.equal(body.crm_id, "lead-202");
      assert.equal(body.linked, true);
      return json(200, {
        ...mockLinks,
        links: [
          ...mockLinks.links,
          { entity_type: "lead", crm_id: "lead-202", name: "New Lead Peter", url: "/leads/lead-202", source: "manual" },
        ],
      });
    }
    if (call.method === "GET" && call.url.includes("/crm/entities")) {
      assert.ok(call.url.includes("q=Peter"));
      return json(200, mockEntities);
    }
    return json(404, {});
  });

  const links = await client.get<ChatCrmLinks>("/conversations/c1/crm-links");
  assert.equal(links.supported, true);
  assert.equal(links.links.length, 1);

  const search = await client.get<CrmEntitiesResponse>("/crm/entities", { query: { conversation_id: "c1", q: "Peter" } });
  assert.equal(search.entities.length, 1);
  assert.equal(search.entities[0]?.crm_id, "lead-202");

  const putRes = await client.put<ChatCrmLinks>("/conversations/c1/crm-links", {
    entity_type: "lead",
    crm_id: "lead-202",
    linked: true,
  });
  assert.equal(putRes.links.length, 2);
});

test("task updates endpoint: POST multipart form", async () => {
  const mockResp: TaskUpdateResponse = {
    update: { id: "upd-1", status: "sent", error: null },
    failed_attachments: 0,
    notified_at: "2026-10-30T10:30:00.000Z",
  };

  const { client } = setupMockClient((call) => {
    if (call.method === "POST" && call.url.includes("/conversations/c1/task-updates")) {
      assert.ok(call.body instanceof FormData);
      const form = call.body as FormData;
      assert.equal(form.get("language"), "sk");
      const items = JSON.parse(String(form.get("items")));
      assert.equal(items.length, 1);
      assert.equal(items[0].task_id, "t-1");
      return json(200, mockResp);
    }
    return json(404, {});
  });

  const form = new FormData();
  form.set("client_request_id", "req-xyz");
  form.set("language", "sk");
  form.set("items", JSON.stringify([{ task_id: "t-1", notes: "Hotovo" }]));

  const res = await client.post<TaskUpdateResponse>("/conversations/c1/task-updates", form);
  assert.equal(res.update.status, "sent");
  assert.equal(res.failed_attachments, 0);
  assert.ok(res.notified_at);
});
