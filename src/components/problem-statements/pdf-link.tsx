import { ExternalLink, FileText } from "lucide-react";
import { cn } from "@/components/ui/cn";
import type { ProblemStatement } from "@/lib/profile/problem-statements";

export function ProblemStatementPdfLink({ statement, className }: { statement: ProblemStatement; className?: string }) {
  return (
    <a
      href={statement.pdfUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={cn("inline-flex w-fit items-center gap-1.5 font-medium text-forest-700 underline underline-offset-2 hover:text-forest-900", className)}
    >
      <FileText className="size-4" aria-hidden />
      Problem statement (PDF)
      <ExternalLink className="size-3.5" aria-hidden />
      <span className="sr-only">for {statement.name}, opens in a new tab</span>
    </a>
  );
}
