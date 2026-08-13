import { useEffect, useState } from "react";
import { AlertTriangle, ExternalLink, FileX2, Loader2 } from "lucide-react";

interface FilePreviewPaneProps {
    url: string;
    name: string;
    t: (en: string, sk: string, hu: string) => string;
}

/**
 * Body of the global file preview modal.
 *
 * PDFs used to be dropped straight into an <iframe>. That is fine when the file
 * is healthy, but when it is not — the upload was truncated, the bytes were
 * never decoded, the file was cleaned off the server — the browser's built-in
 * viewer paints a SOLID BLACK PANE and says nothing the user can act on. The
 * document is therefore probed first, so a missing or damaged file is reported
 * as such instead of looking like a broken preview.
 */
type PreviewStatus = "checking" | "ok" | "missing" | "damaged";

const PDF_MAGIC = "%PDF-";

export default function FilePreviewPane({ url, name, t }: FilePreviewPaneProps) {
    const ext = name.split(".").pop()?.toLowerCase() || "";
    const isImage = ["jpg", "jpeg", "png", "gif", "svg", "webp"].includes(ext);
    const isPdf = ext === "pdf";

    const [status, setStatus] = useState<PreviewStatus>(isPdf ? "checking" : "ok");

    useEffect(() => {
        if (!isPdf) {
            setStatus("ok");
            return;
        }

        const controller = new AbortController();
        setStatus("checking");

        (async () => {
            try {
                // Only the head of the file is needed. Ask for it with a Range and,
                // whether or not the server honours the request, stop reading after
                // the first chunk so a large offer is not downloaded twice.
                const res = await fetch(url, {
                    signal: controller.signal,
                    headers: { Range: "bytes=0-4095" },
                });

                if (res.status === 404 || res.status === 410) {
                    setStatus("missing");
                    return;
                }
                if (!res.ok && res.status !== 206) {
                    setStatus("missing");
                    return;
                }
                // An HTML body where a PDF should be is an error page or a login
                // redirect, never a document worth framing.
                if ((res.headers.get("content-type") || "").includes("text/html")) {
                    setStatus("missing");
                    return;
                }

                const reader = res.body?.getReader();
                if (!reader) {
                    setStatus("ok"); // no streams to inspect — let the viewer try
                    return;
                }
                const { value } = await reader.read();
                await reader.cancel().catch(() => {});
                if (!value) {
                    setStatus("damaged");
                    return;
                }

                // The header may legally sit a little way into the file, so the
                // whole first chunk is searched rather than just its first bytes.
                const head = new TextDecoder("latin1").decode(value);
                setStatus(head.includes(PDF_MAGIC) ? "ok" : "damaged");
            } catch (err) {
                if ((err as any)?.name === "AbortError") return;
                // A probe that fails for network reasons must not block a preview
                // that might well work, so fall through to the viewer.
                setStatus("ok");
            }
        })();

        return () => controller.abort();
    }, [url, isPdf]);

    if (isImage) {
        return (
            <img
                src={url}
                alt={name}
                className="max-w-full max-h-full object-contain p-2"
            />
        );
    }

    if (isPdf) {
        if (status === "checking") {
            return (
                <div className="flex flex-col items-center gap-2 text-slate-400">
                    <Loader2 className="animate-spin text-amber-700" size={22} />
                    <span className="text-[9px] font-bold uppercase tracking-wider">
                        {t("Opening document...", "Otvára sa dokument...", "Dokumentum megnyitása...")}
                    </span>
                </div>
            );
        }

        if (status === "ok") {
            return <iframe src={url} title={name} className="w-full h-full border-none" />;
        }

        const missing = status === "missing";
        return (
            <div className="text-center p-8 max-w-lg">
                {missing ? (
                    <FileX2 className="mx-auto text-slate-400" size={30} />
                ) : (
                    <AlertTriangle className="mx-auto text-amber-600" size={30} />
                )}
                <p className="mt-3 text-xs font-black uppercase tracking-wider text-slate-700">
                    {missing
                        ? t(
                              "This document is no longer on the server.",
                              "Tento dokument sa už na serveri nenachádza.",
                              "Ez a dokumentum már nincs a szerveren.",
                          )
                        : t(
                              "This file is damaged and cannot be displayed.",
                              "Tento súbor je poškodený a nedá sa zobraziť.",
                              "Ez a fájl sérült, és nem jeleníthető meg.",
                          )}
                </p>
                <p className="mt-2 text-[10px] text-slate-500 font-semibold leading-relaxed">
                    {missing
                        ? t(
                              "The timeline entry still refers to it, but the file itself was not found. Ask the person who filed it to attach it again.",
                              "Záznam v časovej osi naň stále odkazuje, samotný súbor sa však nenašiel. Požiadajte kolegu, ktorý ho pridal, o opätovné priloženie.",
                              "Az idővonal bejegyzése még hivatkozik rá, de maga a fájl nem található. Kérje meg a feltöltőt, hogy csatolja újra.",
                          )
                        : t(
                              "The stored file is not a readable PDF — it was most likely truncated or corrupted while being uploaded. Attaching it again usually fixes it.",
                              "Uložený súbor nie je čitateľné PDF — pravdepodobne sa pri nahrávaní orezal alebo poškodil. Zvyčajne pomôže priložiť ho znova.",
                              "A tárolt fájl nem olvasható PDF — valószínűleg feltöltés közben csonkult vagy sérült. Általában segít újra csatolni.",
                          )}
                </p>
                <p className="mt-3 text-[9px] font-mono text-slate-400 break-all">{url}</p>
                {!missing && (
                    <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-[10px] font-black uppercase transition-colors"
                    >
                        <ExternalLink size={12} />
                        {t("Open in a new tab", "Otvoriť na novej karte", "Megnyitás új lapon")}
                    </a>
                )}
            </div>
        );
    }

    return (
        <div className="text-center p-8 text-slate-500">
            <p className="text-3xl mb-2">📄</p>
            <p className="text-xs font-bold uppercase tracking-wider">
                {t(
                    "Preview not supported for this file format.",
                    "Náhľad nie je podporovaný pre tento formát súboru.",
                    "Ehhez a fájlformátumhoz nem érhető el előnézet.",
                )}
            </p>
            <p className="text-[10px] text-slate-400 mt-1">
                {t(
                    "Please use the Download button above to view it offline.",
                    "Použite tlačidlo Stiahnuť vyššie a otvorte súbor offline.",
                    "A fenti Letöltés gombbal nyithatja meg offline.",
                )}
            </p>
        </div>
    );
}
