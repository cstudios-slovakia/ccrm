import { createContext, useContext } from "react";
import { EMPTY_WHATSAPP_DATA, type WhatsAppData } from "../utils/whatsappLinks";

export interface WhatsAppContextValue extends WhatsAppData {
  /** The signed-in CCRM user; their own chats are listed first. */
  viewerId: string | null;
}

/**
 * The chats WAAI has paired with clients, leads and projects, provided once by App from the sync response.
 * Empty until WAAI is connected, and for anyone the `whatsapp` permission is not granted to (the server
 * sends nothing then), so a chip that finds no data simply renders nothing.
 */
export const WhatsAppLinksContext = createContext<WhatsAppContextValue>({ ...EMPTY_WHATSAPP_DATA, viewerId: null });

export const useWhatsAppLinks = (): WhatsAppContextValue => useContext(WhatsAppLinksContext);
