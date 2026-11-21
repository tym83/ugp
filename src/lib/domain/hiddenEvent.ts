export function isHiddenEvent({ slug }: { slug: string | null }): boolean {
  return slug?.endsWith("-test") ?? false;
}
