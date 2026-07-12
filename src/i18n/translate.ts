import type { Dictionary } from "@/i18n/dictionaries/en";

type Primitive = string | number | boolean | null | undefined;

export type TranslationValues = Record<string, Primitive>;

type NestedKeyOf<T, Prefix extends string = ""> = T extends Primitive
  ? never
  : {
      [K in keyof T & string]: T[K] extends Primitive
        ? `${Prefix}${K}`
        : NestedKeyOf<T[K], `${Prefix}${K}.`> | `${Prefix}${K}`;
    }[keyof T & string];

export type MessageKey = NestedKeyOf<Dictionary>;

export function getMessage(
  dictionary: Dictionary,
  key: MessageKey,
): string {
  const segments = key.split(".");
  let current: unknown = dictionary;
  for (const segment of segments) {
    if (current == null || typeof current !== "object") {
      throw new Error(`Missing translation path: ${key}`);
    }
    current = (current as Record<string, unknown>)[segment];
  }
  if (typeof current !== "string") {
    throw new Error(`Translation is not a string: ${key}`);
  }
  return current;
}

export function translate(
  dictionary: Dictionary,
  key: MessageKey,
  values?: TranslationValues,
): string {
  const template = getMessage(dictionary, key);
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = values[name];
    return value == null ? "" : String(value);
  });
}

export function createTranslator(dictionary: Dictionary) {
  return (key: MessageKey, values?: TranslationValues) =>
    translate(dictionary, key, values);
}
