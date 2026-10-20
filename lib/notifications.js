import Notification from "@/models/Notification";

export async function createNotification(data, session) {
  if (session) {
    await Notification.create([data], { session });
    return;
  }
  await Notification.create(data);
}
