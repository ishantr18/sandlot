// Plain text with web addresses turned into real links (new tab). Long
// addresses wrap instead of running off the card. Text stays selectable.
import { ExternalLink } from "lucide-react";

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g;

export default function LinkifiedText({ text, className = "" }: { text: string; className?: string }) {
  const parts = text.split(URL_RE);
  return (
    <p className={`whitespace-pre-wrap [overflow-wrap:anywhere] ${className}`}>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-primary underline underline-offset-2"
          >
            {part}
            <ExternalLink className="ml-0.5 inline h-3.5 w-3.5 align-[-2px]" aria-label="(opens in a new tab)" />
          </a>
        ) : (
          part
        ),
      )}
    </p>
  );
}
