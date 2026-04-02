/**
 * School Legal Store
 *
 * Manages per-school legal documents stored in Firestore.
 * Structure: schools/{schoolId}/legal
 *
 * Each school has:
 * - waiver (required, enabled=true)
 * - cancellation (optional)
 * - refund (optional)
 *
 * Each doc stores text in { en, es, pt }, plus version and updatedAt.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Locale } from "../i18n/translations";

// Legal document types
export type SchoolLegalDocType = "waiver" | "cancellation" | "refund";

// Structure for a localized legal document
export interface SchoolLegalDocument {
  enabled: boolean;
  text: Record<Locale, string>;
  version: string;
  updatedAt: string;
}

// School legal documents collection
export interface SchoolLegalDocuments {
  schoolId: string;
  waiver: SchoolLegalDocument;
  cancellation: SchoolLegalDocument;
  refund: SchoolLegalDocument;
}

// Waiver acceptance record (stored in bookings)
export interface WaiverAcceptance {
  accepted: boolean;
  waiverVersion: string;
  acceptedAt: string;
  schoolId: string;
}

// Default waiver text (BJJ-specific)
const DEFAULT_WAIVER_TEXT: Record<Locale, string> = {
  en: `# Waiver & Release of Liability

## ASSUMPTION OF RISK

I understand that Brazilian Jiu-Jitsu is a CONTACT SPORT with activities with inherent risks, including but not limited to:

- **Equipment-related risks:** Gi/No-gi uniform, mats, and training equipment
- **Physical risks:** Joint locks, chokes, impact injuries, sprains, fractures
- **Third-party actions:** Contact with training partners during sparring
- **Training environment:** Mat burns, bruising, muscle strains

I voluntarily assume all risks associated with my participation in Jiu-Jitsu activities.

## RELEASE AND WAIVER

I hereby RELEASE, WAIVE, DISCHARGE, and COVENANT NOT TO SUE the school, its owners, employees, instructors, and agents from any and all liability, claims, demands, or causes of action arising from my participation in Jiu-Jitsu activities.

This release applies to any injury, death, or property damage that may occur during lessons, including injuries caused by the ordinary negligence of the school or its employees.

## INDEMNIFICATION

I agree to INDEMNIFY and HOLD HARMLESS the school from any claims, damages, or expenses (including legal fees) arising from my participation or any breach of this agreement.

## MEDICAL ACKNOWLEDGMENT

I confirm that:
- I am physically fit to participate in Jiu-Jitsu activities
- I have disclosed any medical conditions that may affect my participation
- I am not under the influence of alcohol or drugs

## MEDIA RELEASE

I grant permission for the school to use photos or videos of my participation for promotional purposes unless I notify them otherwise in writing.

## EQUIPMENT RESPONSIBILITY

I agree to:
- Use equipment as instructed
- Report any equipment damage immediately
- Be financially responsible for damage caused by my negligence

## ACKNOWLEDGMENT

By signing below, I acknowledge that:
- I have read and understood this entire waiver
- I am signing voluntarily and of my own free will
- I am at least 18 years old (or have parental consent)
- This waiver is binding upon myself, my heirs, and legal representatives`,

  es: `# Exención de Responsabilidad

## ASUNCIÓN DE RIESGO

Entiendo que el Jiu-Jitsu Brasileño es un DEPORTE DE CONTACTO con actividades con riesgos inherentes, incluyendo pero no limitado a:

- **Riesgos relacionados con el equipo:** Gi/No-gi, colchonetas y equipo de entrenamiento
- **Riesgos físicos:** Llaves articulares, asfixias, lesiones por impacto, esguinces, fracturas
- **Acciones de terceros:** Contacto con compañeros de entrenamiento durante el sparring
- **Entorno de entrenamiento:** Quemaduras de colchoneta, moretones, distensiones musculares

Asumo voluntariamente todos los riesgos asociados con mi participación en actividades de Jiu-Jitsu.

## LIBERACIÓN Y EXENCIÓN

Por la presente LIBERO, RENUNCIO, DESCARGO y me COMPROMETO A NO DEMANDAR a la escuela, sus propietarios, empleados, instructores y agentes de cualquier responsabilidad, reclamos, demandas o causas de acción derivadas de mi participación en actividades de Jiu-Jitsu.

Esta liberación aplica a cualquier lesión, muerte o daño a la propiedad que pueda ocurrir durante las clases, incluyendo lesiones causadas por negligencia ordinaria de la escuela o sus empleados.

## INDEMNIZACIÓN

Acepto INDEMNIZAR y MANTENER INDEMNE a la escuela de cualquier reclamo, daño o gasto (incluyendo honorarios legales) derivados de mi participación o cualquier incumplimiento de este acuerdo.

## RECONOCIMIENTO MÉDICO

Confirmo que:
- Estoy físicamente apto para participar en actividades de Jiu-Jitsu
- He revelado cualquier condición médica que pueda afectar mi participación
- No estoy bajo la influencia de alcohol o drogas

## AUTORIZACIÓN DE MEDIOS

Otorgo permiso a la escuela para usar fotos o videos de mi participación con fines promocionales a menos que les notifique lo contrario por escrito.

## RESPONSABILIDAD DEL EQUIPO

Acepto:
- Usar el equipo según las instrucciones
- Reportar cualquier daño al equipo inmediatamente
- Ser financieramente responsable por daños causados por mi negligencia

## RECONOCIMIENTO

Al firmar abajo, reconozco que:
- He leído y entendido esta exención completa
- Estoy firmando voluntariamente y por mi propia voluntad
- Tengo al menos 18 años (o tengo consentimiento parental)
- Esta exención es vinculante para mí, mis herederos y representantes legales`,

  "pt-BR": `# Termo de Responsabilidade

## ASSUNÇÃO DE RISCO

Entendo que o Jiu-Jitsu Brasileiro é um ESPORTE DE CONTATO com atividades com riscos inerentes, incluindo mas não limitado a:

- **Riscos relacionados ao equipamento:** Gi/No-gi, tatames e equipamentos de treinamento
- **Riscos físicos:** Chaves articulares, estrangulamentos, lesões por impacto, entorses, fraturas
- **Ações de terceiros:** Contato com parceiros de treino durante o sparring
- **Ambiente de treinamento:** Queimaduras de tatame, contusões, distensões musculares

Assumo voluntariamente todos os riscos associados à minha participação em atividades de Jiu-Jitsu.

## LIBERAÇÃO E ISENÇÃO

Por meio deste, LIBERO, RENUNCIO, DESONERO e me COMPROMETO A NÃO PROCESSAR a escola, seus proprietários, funcionários, instrutores e agentes de qualquer responsabilidade, reclamações, demandas ou causas de ação decorrentes da minha participação em atividades de Jiu-Jitsu.

Esta liberação se aplica a qualquer lesão, morte ou dano à propriedade que possa ocorrer durante as aulas, incluindo lesões causadas por negligência comum da escola ou de seus funcionários.

## INDENIZAÇÃO

Concordo em INDENIZAR e ISENTAR a escola de quaisquer reclamações, danos ou despesas (incluindo honorários advocatícios) decorrentes da minha participação ou qualquer violação deste acordo.

## RECONHECIMENTO MÉDICO

Confirmo que:
- Estou fisicamente apto para participar de atividades de Jiu-Jitsu
- Divulguei quaisquer condições médicas que possam afetar minha participação
- Não estou sob influência de álcool ou drogas

## AUTORIZAÇÃO DE MÍDIA

Concedo permissão à escola para usar fotos ou vídeos da minha participação para fins promocionais, a menos que eu notifique por escrito o contrário.

## RESPONSABILIDADE DO EQUIPAMENTO

Concordo em:
- Usar o equipamento conforme instruído
- Relatar qualquer dano ao equipamento imediatamente
- Ser financeiramente responsável por danos causados por minha negligência

## RECONHECIMENTO

Ao assinar abaixo, reconheço que:
- Li e entendi este termo completo
- Estou assinando voluntariamente e por minha própria vontade
- Tenho pelo menos 18 anos (ou tenho consentimento dos pais)
- Este termo é vinculativo para mim, meus herdeiros e representantes legais`,
};

// Default cancellation policy text
const DEFAULT_CANCELLATION_TEXT: Record<Locale, string> = {
  en: `# Cancellation Policy

## Cancellation by Student

- **24+ hours before lesson:** Full refund or reschedule at no charge
- **12-24 hours before lesson:** 50% refund or reschedule with 50% fee
- **Less than 12 hours:** No refund, lesson credit may be offered at school's discretion

## Cancellation by School

- **Weather conditions:** Full refund or free reschedule
- **Instructor unavailability:** Full refund or free reschedule
- **Other reasons:** Full refund guaranteed

## No-Shows

Failure to appear for a scheduled lesson without prior notice will be treated as a late cancellation (no refund).

## How to Cancel

Contact the school directly via WhatsApp or the app's chat feature.`,

  es: `# Política de Cancelación

## Cancelación por el Estudiante

- **24+ horas antes de la clase:** Reembolso completo o reprogramación sin cargo
- **12-24 horas antes de la clase:** 50% de reembolso o reprogramación con 50% de cargo
- **Menos de 12 horas:** Sin reembolso, crédito de clase puede ofrecerse a discreción de la escuela

## Cancelación por la Escuela

- **Condiciones climáticas:** Reembolso completo o reprogramación gratuita
- **Indisponibilidad del instructor:** Reembolso completo o reprogramación gratuita
- **Otras razones:** Reembolso completo garantizado

## No Presentarse

No presentarse a una clase programada sin aviso previo será tratado como cancelación tardía (sin reembolso).

## Cómo Cancelar

Contacte a la escuela directamente vía WhatsApp o la función de chat de la aplicación.`,

  "pt-BR": `# Política de Cancelamento

## Cancelamento pelo Aluno

- **24+ horas antes da aula:** Reembolso total ou reagendamento sem custo
- **12-24 horas antes da aula:** 50% de reembolso ou reagendamento com 50% de taxa
- **Menos de 12 horas:** Sem reembolso, crédito de aula pode ser oferecido a critério da escola

## Cancelamento pela Escola

- **Condições climáticas:** Reembolso total ou reagendamento gratuito
- **Indisponibilidade do instrutor:** Reembolso total ou reagendamento gratuito
- **Outros motivos:** Reembolso total garantido

## Não Comparecimento

Não comparecer a uma aula agendada sem aviso prévio será tratado como cancelamento tardio (sem reembolso).

## Como Cancelar

Entre em contato com a escola diretamente via WhatsApp ou pelo chat do aplicativo.`,
};

// Default refund policy text
const DEFAULT_REFUND_TEXT: Record<Locale, string> = {
  en: `# Refund Policy

## Eligible Refunds

- Cancelled lessons (per cancellation policy)
- Unused package lessons (pro-rated)
- School-cancelled sessions

## Refund Processing

- **Processing time:** 5-10 business days
- **Method:** Same payment method used for original purchase
- **Packages:** Pro-rated based on lessons used

## Non-Refundable

- Completed lessons
- Late cancellations (less than 12 hours notice)
- No-shows
- Equipment rental fees (if applicable)

## Contact

For refund requests, contact support via the app or email.`,

  es: `# Política de Reembolso

## Reembolsos Elegibles

- Clases canceladas (según política de cancelación)
- Clases de paquete no utilizadas (prorrateadas)
- Sesiones canceladas por la escuela

## Procesamiento de Reembolsos

- **Tiempo de procesamiento:** 5-10 días hábiles
- **Método:** Mismo método de pago usado para la compra original
- **Paquetes:** Prorrateados según clases utilizadas

## No Reembolsable

- Clases completadas
- Cancelaciones tardías (menos de 12 horas de aviso)
- No presentarse
- Tarifas de alquiler de equipo (si aplica)

## Contacto

Para solicitudes de reembolso, contacte soporte vía la app o email.`,

  "pt-BR": `# Política de Reembolso

## Reembolsos Elegíveis

- Aulas canceladas (conforme política de cancelamento)
- Aulas de pacote não utilizadas (proporcionais)
- Sessões canceladas pela escola

## Processamento de Reembolsos

- **Tempo de processamento:** 5-10 dias úteis
- **Método:** Mesmo método de pagamento usado na compra original
- **Pacotes:** Proporcionais com base nas aulas utilizadas

## Não Reembolsável

- Aulas concluídas
- Cancelamentos tardios (menos de 12 horas de aviso)
- Não comparecimento
- Taxas de aluguel de equipamento (se aplicável)

## Contato

Para solicitações de reembolso, entre em contato pelo app ou email.`,
};

// Create default school legal documents
function createDefaultSchoolLegal(schoolId: string): SchoolLegalDocuments {
  const now = new Date().toISOString();
  return {
    schoolId,
    waiver: {
      enabled: true,
      text: DEFAULT_WAIVER_TEXT,
      version: "1.0.0",
      updatedAt: now,
    },
    cancellation: {
      enabled: false,
      text: DEFAULT_CANCELLATION_TEXT,
      version: "1.0.0",
      updatedAt: now,
    },
    refund: {
      enabled: false,
      text: DEFAULT_REFUND_TEXT,
      version: "1.0.0",
      updatedAt: now,
    },
  };
}

interface SchoolLegalState {
  documents: SchoolLegalDocuments | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  loadSchoolLegal: (schoolId: string) => Promise<void>;
  updateDocument: (
    docType: SchoolLegalDocType,
    updates: Partial<SchoolLegalDocument>
  ) => void;
  updateDocumentText: (docType: SchoolLegalDocType, locale: Locale, text: string) => void;
  toggleDocumentEnabled: (docType: SchoolLegalDocType) => void;
  saveToFirestore: () => Promise<void>;
  getLocalizedText: (docType: SchoolLegalDocType, locale: Locale) => string;
  getWaiverForAcceptance: (locale: Locale) => { text: string; version: string } | null;
}

export const useSchoolLegalStore = create<SchoolLegalState>()(
  persist(
    (set, get) => ({
      documents: null,
      isLoading: false,
      error: null,

      loadSchoolLegal: async (schoolId: string) => {
        set({ isLoading: true, error: null });

        try {
          // TODO: Replace with actual Firestore fetch
          // const docRef = doc(db, 'schools', schoolId, 'legal', 'documents');
          // const docSnap = await getDoc(docRef);

          // For now, use local storage or create defaults
          const existing = get().documents;
          if (existing && existing.schoolId === schoolId) {
            set({ isLoading: false });
            return;
          }

          // Create default documents for this school
          const defaultDocs = createDefaultSchoolLegal(schoolId);
          set({ documents: defaultDocs, isLoading: false });
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : "Failed to load legal documents",
            isLoading: false,
          });
        }
      },

      updateDocument: (docType, updates) => {
        const { documents } = get();
        if (!documents) return;

        const now = new Date().toISOString();
        const currentDoc = documents[docType];

        // Increment version if text changed
        let newVersion = currentDoc.version;
        if (updates.text && JSON.stringify(updates.text) !== JSON.stringify(currentDoc.text)) {
          const [major, minor, patch] = currentDoc.version.split(".").map(Number);
          newVersion = `${major}.${minor}.${patch + 1}`;
        }

        set({
          documents: {
            ...documents,
            [docType]: {
              ...currentDoc,
              ...updates,
              version: newVersion,
              updatedAt: now,
            },
          },
        });
      },

      updateDocumentText: (docType, locale, text) => {
        const { documents, updateDocument } = get();
        if (!documents) return;

        const currentDoc = documents[docType];
        updateDocument(docType, {
          text: {
            ...currentDoc.text,
            [locale]: text,
          },
        });
      },

      toggleDocumentEnabled: (docType) => {
        const { documents, updateDocument } = get();
        if (!documents) return;

        // Waiver cannot be disabled
        if (docType === "waiver") return;

        updateDocument(docType, {
          enabled: !documents[docType].enabled,
        });
      },

      saveToFirestore: async () => {
        const { documents } = get();
        if (!documents) return;

        set({ isLoading: true, error: null });

        try {
          // TODO: Replace with actual Firestore save
          // const docRef = doc(db, 'schools', documents.schoolId, 'legal', 'documents');
          // await setDoc(docRef, documents);

          // For now, just simulate save (data is already in Zustand + AsyncStorage)
          await new Promise((resolve) => setTimeout(resolve, 500));

          set({ isLoading: false });
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : "Failed to save legal documents",
            isLoading: false,
          });
        }
      },

      getLocalizedText: (docType, locale) => {
        const { documents } = get();
        if (!documents) return "";

        const doc = documents[docType];
        return doc.text[locale] || doc.text.en || "";
      },

      getWaiverForAcceptance: (locale) => {
        const { documents } = get();
        if (!documents || !documents.waiver.enabled) return null;

        return {
          text: documents.waiver.text[locale] || documents.waiver.text.en,
          version: documents.waiver.version,
        };
      },
    }),
    {
      name: "ayon-flow-school-legal",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        documents: state.documents,
      }),
    }
  )
);

// Helper to create waiver acceptance record
export function createWaiverAcceptance(
  schoolId: string,
  waiverVersion: string
): WaiverAcceptance {
  return {
    accepted: true,
    waiverVersion,
    acceptedAt: new Date().toISOString(),
    schoolId,
  };
}

// Selectors
export const selectSchoolLegal = (state: SchoolLegalState) => state.documents;
export const selectSchoolLegalLoading = (state: SchoolLegalState) => state.isLoading;
export const selectSchoolLegalError = (state: SchoolLegalState) => state.error;
