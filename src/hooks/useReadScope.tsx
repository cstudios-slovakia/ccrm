import { createContext, useContext } from "react";
import { EMPTY_READ_SCOPE, type ReadScope } from "../utils/readScope";

/**
 * The server's read scope for this session, provided once by App. A view that
 * shows a lead or project NAME for a record it may not open (a task card's
 * client, say) asks here instead of getting the whole record.
 */
export const ReadScopeContext = createContext<ReadScope>(EMPTY_READ_SCOPE);

export const useReadScope = (): ReadScope => useContext(ReadScopeContext);
