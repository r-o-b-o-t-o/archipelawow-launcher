import type { Resource } from "solid-js";

/** The resource's value, or undefined while loading or once it failed: reading a failed resource throws. */
export const loaded = <T>(resource: Resource<T>) => (resource.error ? undefined : resource());
