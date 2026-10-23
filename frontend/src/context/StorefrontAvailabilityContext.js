import { createContext } from "react";

/**
 * Shared availability state for the storefront shell and the catalog page.
 * It is provided by StorefrontAvailabilityProvider so a single verification
 * cycle feeds both the service banner and the product grid.
 */
export const StorefrontAvailabilityContext = createContext(null);
