// Link rules in the UI mirror the core (model.rs clean_rule_value / route_link).
import { describe, expect, test } from "bun:test";
import { cleanValue, routeLink, ruleLine, RULE_KINDS } from "../browser/linkRules";
import type { LinkRule, Space } from "../browser/api";

const rules: LinkRule[] = [
  { id: "r1", when: "domain", value: "github.com", spaceId: "code" },
  { id: "r2", when: "app", value: "slack", spaceId: "work" },
  { id: "r3", when: "contains", value: "invoice", spaceId: "work" },
];
const spaces: Space[] = [{ id: "work", name: "Work", profile: "a" }, { id: "code", name: "Code", profile: "b" }];

describe("link rules", () => {
  test("values are cleaned like the core does", () => {
    expect(cleanValue("domain", "https://www.GitHub.com/orionopenwow")).toBe("github.com");
    expect(cleanValue("domain", "*.example.org")).toBe("example.org");
    expect(cleanValue("domain", "not a host")).toBeNull();
    expect(cleanValue("app", "C:\\Program Files\\Slack\\slack.exe")).toBe("slack");
    expect(cleanValue("contains", "  Invoice ")).toBe("invoice");
    expect(cleanValue("contains", "   ")).toBeNull();
  });
  test("first matching rule wins; subdomains match, look-alikes don't", () => {
    expect(routeLink(rules, "https://gist.github.com/x")).toBe("code");
    expect(routeLink(rules, "https://notgithub.com/x")).toBeNull();
    expect(routeLink(rules, "https://docs.example/", "Slack.exe")).toBe("work");
    expect(routeLink(rules, "https://shop.example/INVOICE/2")).toBe("work");
    expect(routeLink(rules, "https://github.com/", "slack")).toBe("code");
    expect(routeLink([], "https://github.com/")).toBeNull();
  });
  test("rules read as plain sentences", () => {
    expect(ruleLine(rules[0], spaces)).toBe("Links to github.com → Code");
    expect(ruleLine(rules[1], spaces)).toBe("Links from slack → Work");
    expect(ruleLine({ ...rules[2], spaceId: "gone" }, spaces)).toBe("Links containing “invoice” → a removed space");
    expect(RULE_KINDS.map((k) => k.id)).toEqual(["domain", "app", "contains"]);
  });
});
