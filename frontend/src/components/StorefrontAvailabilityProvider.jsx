import useBackendAvailability from "../hooks/useBackendAvailability";
import { StorefrontAvailabilityContext } from "../context/StorefrontAvailabilityContext";

/**
 * Owns the single backend availability verification cycle for the storefront
 * and shares it with the shell and the catalog page.
 */
export default function StorefrontAvailabilityProvider({ children }) {
  const availability = useBackendAvailability();

  return (
    <StorefrontAvailabilityContext.Provider value={availability}>
      {children}
    </StorefrontAvailabilityContext.Provider>
  );
}
