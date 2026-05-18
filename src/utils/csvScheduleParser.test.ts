import { describe, it, expect } from "vitest";
import { parseLoanCSV, validateSchedule, type ParsedScheduleRow } from "./csvScheduleParser";

const row = (over: Partial<ParsedScheduleRow> = {}): ParsedScheduleRow => ({
  date: "2024-10-20",
  payment: 100,
  principal: 90,
  interest: 10,
  insurance: 0,
  remainingBalance: 0,
  ...over,
});

describe("validateSchedule", () => {
  it("rejects an empty schedule", () => {
    const r = validateSchedule([], null);
    expect(r.valid).toBe(false);
    expect(r.errors).toHaveLength(1);
  });

  it("errors when the final remaining balance is not cleared", () => {
    const r = validateSchedule([row({ remainingBalance: 500 })], null);
    expect(r.valid).toBe(false);
    expect(r.errors.join(" ")).toMatch(/capital restant/i);
  });

  it("warns on non-chronological dates", () => {
    const r = validateSchedule(
      [
        row({ date: "2024-11-20", remainingBalance: 50 }),
        row({ date: "2024-10-20", remainingBalance: 0 }),
      ],
      null,
    );
    expect(r.valid).toBe(true);
    expect(r.warnings.join(" ")).toMatch(/chronologiques/i);
  });

  it("accepts a clean decreasing schedule", () => {
    const r = validateSchedule(
      [
        row({ date: "2024-10-20", remainingBalance: 100 }),
        row({ date: "2024-11-20", remainingBalance: 0 }),
      ],
      null,
    );
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });
});

describe("parseLoanCSV", () => {
  const csvFile = (content: string) =>
    new File([content], "schedule.csv", { type: "text/csv" });

  it("parses a French semicolon/comma-decimal bank schedule with a DBL row", async () => {
    const csv = [
      "DATE;N°;Montant échéance;Intérêts;Assurance;Capital amorti;Capital restant dû",
      "25/09/2024;DBL;0,00;0,00;0,00;0,00;20000,00",
      "20/10/2024;1;7000,00;100,00;0,00;6900,00;13100,00",
      "20/11/2024;2;7000,00;65,50;0,00;6934,50;6165,50",
      "20/12/2024;3;6231,00;65,50;0,00;6165,50;0,00",
    ].join("\n");

    const result = await parseLoanCSV(csvFile(csv));

    expect(result.validation.valid).toBe(true);
    expect(result.schedule).toHaveLength(3); // DBL row excluded
    expect(result.totalAmount).toBe(20000); // from DBL CRD
    expect(result.startDate).toBe("2024-10-20");
    expect(result.duration).toBe(3);
    expect(result.schedule[2].remainingBalance).toBe(0);
  });

  it("rejects an unrecognized header layout", async () => {
    const csv = ["foo,bar,baz", "1,2,3"].join("\n");
    const result = await parseLoanCSV(csvFile(csv));
    expect(result.validation.valid).toBe(false);
    expect(result.schedule).toHaveLength(0);
  });

  it("rejects a file with no data rows", async () => {
    const result = await parseLoanCSV(csvFile("DATE;N°;Montant"));
    expect(result.validation.valid).toBe(false);
  });
});
