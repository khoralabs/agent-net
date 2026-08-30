export type MarketplaceReportLine = {
  step: string;
  at: string;
  [key: string]: unknown;
};

export function reportLine(step: string, fields: Record<string, unknown> = {}): void {
  const line: MarketplaceReportLine = {
    step,
    at: new Date().toISOString(),
    ...fields,
  };
  console.log(JSON.stringify(line));
}
