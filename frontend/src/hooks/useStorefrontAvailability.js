import { useContext } from "react";
import { StorefrontAvailabilityContext } from "../context/StorefrontAvailabilityContext";

/**
 * Reads the shared storefront availability state.
 */
export default function useStorefrontAvailability() {
  const availability = useContext(StorefrontAvailabilityContext);

  if (!availability) {
    throw new Error(
      "useStorefrontAvailability must be used inside StorefrontAvailabilityProvider."
    );
  }

  return availability;
}
