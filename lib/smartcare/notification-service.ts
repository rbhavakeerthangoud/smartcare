export type NotificationStatus =
  | "CREATED"
  | "QUEUED"
  | "SENT"
  | "DELIVERED"
  | "FAILED"
  | "ACKNOWLEDGED";

export type NotificationChannel = "WEB" | "EMAIL" | "SMS" | "VOICE";

export interface NotificationRecord {
  id: string;
  escalationId: string;
  recipientId: string;
  channel: NotificationChannel;
  status: NotificationStatus;
  createdAt: string;
  updatedAt: string;
  error?: string;
}

export interface NotificationAdapter {
  channel: NotificationChannel;
  deliver(input: {
    recipientId: string;
    title: string;
    body: string;
  }): Promise<"SENT" | "DELIVERED">;
}

export interface NotificationRepository {
  save(notification: NotificationRecord): Promise<void>;
}

export async function sendNotification(input: {
  id: string;
  escalationId: string;
  recipientId: string;
  title: string;
  body: string;
  adapter: NotificationAdapter;
  repository: NotificationRepository;
  now?: Date;
}): Promise<NotificationRecord> {
  const now = (input.now || new Date()).toISOString();
  const notification: NotificationRecord = {
    id: input.id,
    escalationId: input.escalationId,
    recipientId: input.recipientId,
    channel: input.adapter.channel,
    status: "CREATED",
    createdAt: now,
    updatedAt: now,
  };

  await input.repository.save(notification);
  notification.status = "QUEUED";
  notification.updatedAt = new Date().toISOString();
  await input.repository.save(notification);

  try {
    const deliveryStatus = await input.adapter.deliver({
      recipientId: input.recipientId,
      title: input.title,
      body: input.body,
    });
    notification.status = deliveryStatus === "DELIVERED" ? "DELIVERED" : "SENT";
    notification.updatedAt = new Date().toISOString();
    await input.repository.save(notification);
    return notification;
  } catch (error) {
    notification.status = "FAILED";
    notification.error =
      error instanceof Error ? error.message : "Notification delivery failed.";
    notification.updatedAt = new Date().toISOString();
    await input.repository.save(notification);
    throw error;
  }
}
