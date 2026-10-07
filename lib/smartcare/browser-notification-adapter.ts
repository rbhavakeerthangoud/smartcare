import type { NotificationAdapter } from "./notification-service";

export const browserNotificationAdapter: NotificationAdapter = {
  channel: "WEB",
  async deliver({ title, body }) {
    if (typeof window === "undefined" || !("Notification" in window)) {
      throw new Error("Web notifications are not supported in this browser.");
    }

    let permission = Notification.permission;
    if (permission === "default") {
      permission = await Notification.requestPermission();
    }
    if (permission !== "granted") {
      throw new Error("Web notification permission was not granted.");
    }

    new Notification(title, { body });
    return "SENT";
  },
};
