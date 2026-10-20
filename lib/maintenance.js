import PortalSettings from "@/models/PortalSettings";

export async function isMaintenanceMode() {
  const settings = await PortalSettings.findOne({ key: "global" })
    .select("maintenanceMode")
    .lean();
  return settings?.maintenanceMode === true;
}
