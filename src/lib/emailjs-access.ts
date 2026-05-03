import emailjs from "@emailjs/browser";

/** EmailJS 템플릿에 `{{service_name}}` `{{access_location}}` `{{access_time}}` 배치 */
export function isEmailJsAccessNotifyConfigured(): boolean {
  const k = import.meta.env.VITE_EMAILJS_PUBLIC_KEY ?? "";
  const s = import.meta.env.VITE_EMAILJS_SERVICE_ID ?? "";
  const t = import.meta.env.VITE_EMAILJS_TEMPLATE_ID ?? "";
  return Boolean(k && s && t);
}

export async function sendAccessNotifyEmail(params: {
  accessLocation: string;
  accessTime: string;
}): Promise<void> {
  const publicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY ?? "";
  const serviceId = import.meta.env.VITE_EMAILJS_SERVICE_ID ?? "";
  const templateId = import.meta.env.VITE_EMAILJS_TEMPLATE_ID ?? "";
  if (!publicKey || !serviceId || !templateId) return;

  await emailjs.send(
    serviceId,
    templateId,
    {
      service_name: "해양 종자 살포 관제",
      access_location: params.accessLocation,
      access_time: params.accessTime,
    },
    { publicKey },
  );
}
