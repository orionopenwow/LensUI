// Suggested apps: the local, no-LLM predictor in src/dock/ai/predict.ts.
import { describe, expect, test } from "bun:test";
import { emptyModel, recordLaunch, suggest, MAX_APPS, HALF_LIFE_DAYS } from "../dock/ai/predict";

const at = (day: number, hour: number, min = 0) => new Date(2026, 10, day, hour, min); // Nov 2026; 23 = Monday
const code = { key: "C:\\x\\Code.exe", name: "VS Code", path: "C:\\x\\Code.exe" };
const spotify = { key: "c:\\x\\spotify.exe", name: "Spotify", path: "c:\\x\\spotify.exe" };
const steam = { key: "c:\\x\\steam.exe", name: "Steam", path: "c:\\x\\steam.exe" };

function habit() {
  let m = emptyModel();
  // Weekday mornings: Code at 9. Weekday evenings and weekends: Steam at 20. Spotify a bit, any time.
  for (let d = 2; d <= 20; d++) {
    const date = new Date(2026, 10, d);
    const weekend = date.getDay() === 0 || date.getDay() === 6;
    if (!weekend) m = recordLaunch(m, code, at(d, 9, 5));
    m = recordLaunch(m, steam, at(d, 20, 30));
    if (d % 3 === 0) m = recordLaunch(m, spotify, at(d, 14));
  }
  return m;
}

describe("predictor", () => {
  test("keys are normalised and counts accumulate", () => {
    let m = emptyModel();
    m = recordLaunch(m, code, at(2, 9));
    m = recordLaunch(m, { ...code, key: code.key.toUpperCase() }, at(2, 10));
    expect(Object.keys(m.apps)).toEqual(["c:\\x\\code.exe"]);
    expect(m.apps["c:\\x\\code.exe"].count).toBeCloseTo(2, 2);
    expect(m.apps["c:\\x\\code.exe"].hours[9]).toBeCloseTo(1, 2);
  });

  test("recordLaunch is pure", () => {
    const m = emptyModel();
    recordLaunch(m, code, at(2, 9));
    expect(Object.keys(m.apps)).toHaveLength(0);
  });

  test("time of day decides the top suggestion", () => {
    const m = habit();
    expect(suggest(m, at(23, 9, 15))[0].name).toBe("VS Code"); // Monday morning
    expect(suggest(m, at(23, 20, 15))[0].name).toBe("Steam"); // Monday evening
  });

  test("never suggests what's already in the Dock, and caps at 3", () => {
    const m = habit();
    const s = suggest(m, at(23, 9), { exclude: [code.key], limit: 5 });
    expect(s.find((x) => x.name === "VS Code")).toBeUndefined();
    expect(s.length).toBeLessThanOrEqual(3);
  });

  test("one-off launches are ignored", () => {
    let m = emptyModel();
    m = recordLaunch(m, code, at(20, 9));
    m = recordLaunch(m, code, at(21, 9));
    expect(suggest(m, at(22, 9))).toHaveLength(0);
  });

  test("old habits decay", () => {
    let m = emptyModel();
    for (let i = 0; i < 6; i++) m = recordLaunch(m, code, new Date(2026, 0, 5 + i, 9));
    const fresh = suggest(m, new Date(2026, 0, 12, 9));
    const months = suggest(m, new Date(2026, 0, 12 + HALF_LIFE_DAYS * 6, 9));
    expect(fresh).toHaveLength(1);
    expect(months).toHaveLength(0); // decayed below the minimum count
  });

  test("explains itself in plain words", () => {
    const s = suggest(habit(), at(23, 9));
    expect(s[0].why).toMatch(/VS Code around 9 AM on weekdays/);
  });

  test("the store stays bounded", () => {
    let m = emptyModel();
    for (let i = 0; i < MAX_APPS + 25; i++) m = recordLaunch(m, { key: `app${i}`, name: `App ${i}`, path: `p${i}` }, at(2, 9));
    expect(Object.keys(m.apps).length).toBe(MAX_APPS);
  });
});
