// Settings → Integrations → API: how a web form sends files with a submission.
// The endpoint and its limits live in public/api/pipeline_attachments.php.

type Lang = string;

const pick = (lang: Lang, en: string, sk: string, hu: string) => (lang === "sk" ? sk : lang === "hu" ? hu : en);

export function PipelineAttachmentsGuide({ lang, apiKey }: { lang: Lang; apiKey: string }) {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://yourdomain.com";
  return (
    <div className="space-y-3">
      <p className="text-ui text-gray-600 leading-relaxed">
        {pick(
          lang,
          "To send files, post multipart/form-data instead of JSON: the same fields as form fields (or the whole JSON object in one payload field) and one or more files under any field name. Up to 10 files, 10 MB each, 25 MB together; documents, images, CAD drawings and zip only. The files are attached to the lead's timeline note. A file that is refused is skipped and named on the note; the lead is always saved.",
          "Ak chcete poslať súbory, odošlite multipart/form-data namiesto JSON: rovnaké polia ako polia formulára (alebo celý JSON objekt v jednom poli payload) a jeden či viac súborov pod ľubovoľným názvom poľa. Najviac 10 súborov, každý do 10 MB, spolu do 25 MB; len dokumenty, obrázky, výkresy CAD a zip. Súbory sa priložia k poznámke na časovej osi leadu. Odmietnutý súbor sa preskočí a uvedie v poznámke; lead sa uloží vždy.",
          "Fájlok küldéséhez JSON helyett multipart/form-data kérést küldjön: ugyanazokat a mezőket űrlapmezőként (vagy a teljes JSON objektumot egyetlen payload mezőben) és egy vagy több fájlt tetszőleges mezőnéven. Legfeljebb 10 fájl, egyenként 10 MB, összesen 25 MB; csak dokumentumok, képek, CAD rajzok és zip. A fájlok a lead idővonal-jegyzetéhez csatolódnak. Az elutasított fájl kimarad, és a jegyzet megnevezi; a lead mindig mentésre kerül.",
        )}
      </p>
      <div className="p-5 rounded-lg bg-gray-900 text-gray-100 font-mono text-caption overflow-x-auto shadow-xs border border-gray-800">
        <div className="text-gray-400 select-none pb-2 border-b border-gray-800 mb-3 flex justify-between items-center">
          <span>{pick(lang, "With attachments", "S prílohami", "Csatolmányokkal")}</span>
          <span className="type-overline bg-gray-800 text-gray-300 px-2 py-0.5 rounded">POST</span>
        </div>
        <pre className="whitespace-pre overflow-x-auto leading-relaxed text-emerald-400">
          {`curl -X POST ${origin}/api/pipeline.php \\
  -H "X-API-KEY: ${apiKey || "sk_live_########################"}" \\
  -F "contact_name=John Doe" \\
  -F "email=john@acme.com" \\
  -F "message=Plans attached." \\
  -F "attachments[]=@floor-plan.pdf" \\
  -F "attachments[]=@site-photo.jpg"`}
        </pre>
      </div>
    </div>
  );
}
