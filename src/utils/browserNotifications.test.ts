import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getBrowserNotificationPermission,
  playNotificationChime,
  sendBrowserNotification,
  sendTaskPushNotification,
  registerWebPushSubscription,
  unregisterWebPushSubscription,
} from "./browserNotifications.ts";

test("getBrowserNotificationPermission returns unsupported in node/headless env", () => {
  const perm = getBrowserNotificationPermission();
  assert.equal(perm, "unsupported");
});

test("playNotificationChime is safe to call in any environment without throwing", () => {
  assert.doesNotThrow(() => {
    playNotificationChime();
  });
});

test("sendBrowserNotification returns false when Notification API is unsupported", () => {
  const result = sendBrowserNotification("Test Title", { body: "Test body" });
  assert.equal(result, false);
});

test("registerWebPushSubscription returns false safely in non-browser env", async () => {
  const result = await registerWebPushSubscription();
  assert.equal(result, false);
});

test("unregisterWebPushSubscription returns false safely in non-browser env", async () => {
  const result = await unregisterWebPushSubscription();
  assert.equal(result, false);
});

test("sendTaskPushNotification safely executes and falls back without errors", () => {
  const result = sendTaskPushNotification({
    title: "New Task Assigned",
    body: "You have been assigned to prepare the Q3 invoice.",
    type: "assigned",
    playSound: false,
  });
  assert.equal(result, false);
});
