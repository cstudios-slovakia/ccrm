import React from "react";
import { Copy } from "lucide-react";
import type { Translate } from "../utils/taskLabels";

interface CronSetupInstructionsProps {
  cronToken: string;
  origin: string;
  t: Translate;
  onCopied: () => void;
}

/**
 * The three ways a host can run api/cron.php every minute. Hosts differ: a VPS has a
 * crontab, shared hosting (e.g. Websupport) often only offers "visit a URL" or "run a
 * PHP file". All three run the same job.
 */
export const CronSetupInstructions: React.FC<CronSetupInstructionsProps> = ({ cronToken, origin, t, onCopied }) => {
  const token = cronToken || "TOKEN";
  const endpoint = `${origin}/api/cron.php`;
  const options = [
    {
      key: "command",
      title: t("Command for a crontab", "Príkaz pre crontab", "Parancs a crontabhoz"),
      value: `curl -s -H "X-Cron-Token: ${token}" "${endpoint}"`,
      copyLabel: t("Copy command", "Kopírovať príkaz", "Parancs másolása"),
      note: t(
        "Add it to the server's crontab and run it every minute (* * * * * followed by the command). The token is sent as a header, so it does not end up in access logs.",
        "Pridajte ho do crontabu na serveri a spúšťajte ho každú minútu (* * * * * a príkaz). Token sa posiela v hlavičke, takže sa nezapíše do prístupových logov.",
        "Adja hozzá a szerver crontabjához, percenként futtatva (* * * * * és a parancs). A token fejlécben megy, így nem kerül a hozzáférési naplóba.",
      ),
    },
    {
      key: "url",
      title: t("URL, for hosting that can only visit a link", "URL, pre hosting, ktorý vie len navštíviť odkaz", "URL, olyan tárhelyhez, amely csak linket tud megnyitni"),
      value: `${endpoint}?token=${token}`,
      copyLabel: t("Copy URL", "Kopírovať URL", "URL másolása"),
      note: t(
        "For a hosting cron that only opens a web address (wget). The token is part of the address, so it can appear in the web server's access log; use the command where the host allows it.",
        "Pre cron na hostingu, ktorý len otvorí webovú adresu (wget). Token je súčasťou adresy, takže sa môže objaviť v prístupovom logu servera; ak to hosting dovolí, použite radšej príkaz.",
        "Olyan tárhely-cronhoz, amely csak egy webcímet nyit meg (wget). A token a cím része, ezért megjelenhet a webszerver hozzáférési naplójában; ahol lehet, használja inkább a parancsot.",
      ),
    },
    {
      key: "php",
      title: t("PHP file, for hosting that runs a script", "PHP súbor, pre hosting, ktorý spúšťa skript", "PHP fájl, olyan tárhelyhez, amely szkriptet futtat"),
      value: "api/cron.php",
      copyLabel: t("Copy path", "Kopírovať cestu", "Útvonal másolása"),
      note: t(
        "For a hosting cron that runs a PHP file: choose api/cron.php in the application's folder. No token is needed, because the file runs on the server itself.",
        "Pre cron na hostingu, ktorý spúšťa PHP súbor: vyberte api/cron.php v priečinku aplikácie. Token netreba, pretože súbor beží priamo na serveri.",
        "PHP fájlt futtató tárhely-cronhoz: válassza az alkalmazás mappájában az api/cron.php fájlt. Token nem kell, mert a fájl magán a szerveren fut.",
      ),
    },
  ];

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mt-6 space-y-4">
      <div>
        <span className="type-overline text-slate-400">{t("Cron Webhook Link", "Cron Webhook Link", "Cron Webhook Link")}</span>
        <p className="text-micro text-slate-500 mt-1 leading-relaxed">
          {t(
            "Timers, queued workflows, reminders and mail filing run when the server calls this job, ideally every minute. Use whichever of the three ways your hosting offers.",
            "Časovače, front automatizácií, pripomienky a zakladanie e-mailov bežia, keď server spustí túto úlohu, ideálne každú minútu. Použite ten z troch spôsobov, ktorý ponúka váš hosting.",
            "Az időzítők, a munkafolyamat-sor, az emlékeztetők és a levelek iktatása akkor fut, amikor a szerver elindítja ezt a feladatot, ideálisan percenként. Használja a három mód közül azt, amelyet a tárhelye kínál.",
          )}
        </p>
      </div>
      {options.map((option) => (
        <div key={option.key}>
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-caption font-bold text-slate-600">{option.title}</span>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(option.value);
                onCopied();
              }}
              className="text-ui font-bold text-purple-700 hover:text-purple-900 flex items-center gap-1 shrink-0"
            >
              <Copy className="h-3 w-3" />
              {option.copyLabel}
            </button>
          </div>
          <code className="text-micro font-mono block break-all bg-white p-2.5 border border-slate-200 rounded text-slate-600">
            {option.value}
          </code>
          <p className="text-micro text-slate-400 mt-1.5 leading-relaxed">{option.note}</p>
        </div>
      ))}
    </div>
  );
};
