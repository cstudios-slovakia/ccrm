import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * AI answers and digests. react-markdown's default does not parse raw HTML (`rehype-raw` is not used),
 * so a message cannot smuggle a tag into the page.
 */
export const AiMarkdown = ({ text }: { text: string }) => (
  <div className="type-body space-y-2 text-slate-800 [&_a]:text-green-700 [&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5">
    <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
  </div>
);
