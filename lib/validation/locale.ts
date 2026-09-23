import { z } from "zod";
import { pt } from "zod/locales";

/** Mensagens padrao do Zod em portugues (mensagens especificas continuam definidas nos schemas). */
z.config(pt());
