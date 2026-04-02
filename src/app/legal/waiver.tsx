// src/app/(tabs)/waiver.tsx

import React, { useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { doc, getDoc } from "firebase/firestore";

import { db } from "@/lib/firebase-config";
import { useTranslations } from "@/lib/i18n";
import { useCurrentUser } from "@/lib/hooks/useCurrentUser";

type Locale = "en" | "pt-BR" | "es";

type WaiverDoc = {
  title?: string;
  content?: string | Record<string, string>;
  updatedAt?: any;
};

function getLocaleFromTranslator(t: any): Locale {
  const loc = String(t?.__locale ?? "en");
  if (loc === "pt-BR" || loc === "es" || loc === "en") return loc as Locale;
  return "en";
}

function defaultWaiver(locale: Locale) {
  const title =
    locale === "pt-BR"
      ? "Termo de Isenção & Liberação de Responsabilidade"
      : locale === "es"
      ? "Exención & Liberación de Responsabilidad"
      : "Waiver & Release of Liability";

  const subtitle =
    locale === "pt-BR"
      ? "Leia com atenção antes de participar"
      : locale === "es"
      ? "Lee cuidadosamente antes de participar"
      : "Please read carefully before participating";

  const body =
    locale === "pt-BR"
      ? `
1. ASSUNÇÃO DE RISCO
Eu entendo que Jiu-Jitsu, grappling, treinamento físico e atividades relacionadas envolvem riscos inerentes, incluindo (mas não se limitando a) torções, distensões, luxações, fraturas, contusões, quedas, impactos, técnicas de pressão e contato físico com parceiros de treino. Eu participo voluntariamente e assumo todos os riscos, conhecidos ou desconhecidos.

2. LIBERAÇÃO E RENÚNCIA
Em troca de ser permitido(a) participar, eu libero e isento a academia, seus proprietários, instrutores, funcionários, voluntários e agentes (“Partes Liberadas”) de quaisquer reivindicações por lesões, danos, incapacidade ou morte relacionados à participação, na máxima extensão permitida por lei.

3. CONDIÇÕES MÉDICAS E EMERGÊNCIA
Eu declaro estar apto(a) a participar e que informei condições médicas relevantes. Autorizo atendimento médico de emergência quando necessário e aceito responsabilidade por custos associados.

4. REGRAS E SEGURANÇA
Eu concordo em seguir as regras e instruções dos instrutores, treinar com controle, “bater” (tap) quando necessário e liberar imediatamente quando o parceiro bater.

5. INDENIZAÇÃO
Eu concordo em indenizar e isentar as Partes Liberadas por custos e responsabilidades decorrentes da minha conduta negligente ou violação de regras.

6. MÍNIMOS
Se o participante for menor de 18 anos, um pai/mãe ou responsável legal deve aceitar este termo e concorda com os termos em nome do menor.

7. SEPARABILIDADE E LEI APLICÁVEL
Se qualquer parte for considerada inválida, o restante continuará em vigor. Este termo é regido pelas leis da jurisdição onde a academia está localizada.

8. ACEITE
Ao aceitar este termo no aplicativo (incluindo durante o agendamento), eu confirmo que li, entendi e concordo com estes termos.
      `.trim()
      : locale === "es"
      ? `
1. ASUNCIÓN DE RIESGO
Entiendo que Jiu-Jitsu, grappling, acondicionamiento físico y actividades relacionadas implican riesgos inherentes, incluyendo (pero no limitado a) esguinces, distensiones, luxaciones, fracturas, contusiones, caídas, impactos, técnicas de presión y contacto físico con compañeros de entrenamiento. Participo voluntariamente y asumo todos los riesgos, conocidos o desconocidos.

2. LIBERACIÓN Y RENUNCIA
A cambio de poder participar, libero y renuncio a cualquier reclamación contra la academia, sus dueños, instructores, empleados, voluntarios y agentes (“Partes Liberadas”) por lesiones, daños, incapacidad o muerte relacionados con la participación, en la máxima medida permitida por la ley.

3. CONDICIONES MÉDICAS Y EMERGENCIA
Declaro que estoy en condiciones de participar y que he informado condiciones médicas relevantes. Autorizo atención médica de emergencia si es necesario y acepto responsabilidad por los costos relacionados.

4. REGLAS Y SEGURIDAD
Acepto seguir las reglas e instrucciones, entrenar con control, “tapar” (tap) cuando sea necesario y soltar inmediatamente cuando mi compañero tape.

5. INDEMNIZACIÓN
Acepto indemnizar y eximir a las Partes Liberadas por costos y responsabilidades derivados de mi conducta negligente o violación de reglas.

6. MENORES
Si el participante es menor de 18 años, un padre/madre o tutor legal debe aceptar esta exención y acepta estos términos en nombre del menor.

7. DIVISIBILIDAD Y LEY APLICABLE
Si alguna parte se considera inválida, el resto seguirá vigente. Esta exención se rige por las leyes de la jurisdicción donde se encuentra la academia.

8. ACEPTACIÓN
Al aceptar esta exención en la app (incluyendo durante una reserva), confirmo que la leí, la entendí y acepto estos términos.
      `.trim()
      : `
1. ASSUMPTION OF RISK
I understand that Jiu-Jitsu, grappling, conditioning, and related activities involve inherent risks, including (but not limited to) sprains, strains, dislocations, fractures, bruising, falls, impacts, pressure techniques, and physical contact with training partners. I voluntarily participate and assume all risks, known or unknown.

2. RELEASE AND WAIVER
In exchange for being permitted to participate, I release and waive any claims against the academy, its owners, coaches/instructors, staff, volunteers, and agents (“Released Parties”) for injury, damage, disability, or death related to participation, to the fullest extent permitted by law.

3. MEDICAL ACKNOWLEDGMENT AND EMERGENCY CARE
I confirm I am fit to participate and have disclosed relevant conditions. I authorize emergency medical care if needed and accept responsibility for related costs.

4. RULES AND SAFETY
I agree to follow all rules and instructor directions, train with control, tap when needed, and release immediately when a partner taps.

5. INDEMNIFICATION
I agree to indemnify and hold harmless the Released Parties from costs and liabilities arising from my negligent conduct or violation of rules.

6. MINORS
If the participant is under 18, a parent/legal guardian must accept this waiver and agrees to these terms on behalf of the minor.

7. SEVERABILITY AND GOVERNING LAW
If any part is found unenforceable, the remainder remains in effect. This waiver is governed by the laws of the jurisdiction where the academy is located.

8. ACCEPTANCE
By accepting this waiver in the app (including during booking), I confirm I have read, understood, and agree to these terms.
      `.trim();

  return { title, subtitle, body };
}

export default function WaiverScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useTranslations();
  const locale = getLocaleFromTranslator(t);

  const { schoolId } = useCurrentUser();

  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState<string>("");
  const [subtitle, setSubtitle] = useState<string>("");
  const [content, setContent] = useState<string>("");

  const fallback = useMemo(() => defaultWaiver(locale), [locale]);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        setLoading(true);

        // If schoolId not ready, show fallback (no blank screen)
        if (!schoolId) {
          if (!mounted) return;
          setTitle(fallback.title);
          setSubtitle(fallback.subtitle);
          setContent(fallback.body);
          setLoading(false);
          return;
        }

        const ref = doc(db, "schools", schoolId, "legal", "waiver");
        const snap = await getDoc(ref);

        if (!mounted) return;

        const data = (snap.exists() ? (snap.data() as WaiverDoc) : null) ?? null;

        const firestoreTitle =
          (data?.title && String(data.title).trim()) || fallback.title;

        let firestoreContent = "";
        if (typeof data?.content === "string") {
          firestoreContent = data.content;
        } else if (data?.content && typeof data.content === "object") {
          firestoreContent =
            data.content[locale] ||
            data.content["en"] ||
            "";
        }

        firestoreContent = String(firestoreContent || "").trim();

        setTitle(firestoreTitle);
        setSubtitle(fallback.subtitle);
        setContent(firestoreContent.length > 0 ? firestoreContent : fallback.body);
        setLoading(false);
      } catch {
        if (!mounted) return;
        setTitle(fallback.title);
        setSubtitle(fallback.subtitle);
        setContent(fallback.body);
        setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [schoolId, locale, fallback.title, fallback.subtitle, fallback.body]);

  return (
    <View className="flex-1 bg-white" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center px-4 py-3 border-b border-gray-100">
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
          className="flex-row items-center py-2 pr-4 active:opacity-70"
        >
          <ChevronLeft size={24} color="#0070B8" />
          <Text className="text-ocean text-base ml-1" style={{ fontFamily: "Outfit_500Medium" }}>
            {locale === "pt-BR" ? "Voltar" : locale === "es" ? "Volver" : "Back"}
          </Text>
        </Pressable>
      </View>

      <ScrollView className="flex-1 px-6 pt-6" showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.springify()}>
          <Text className="text-3xl font-bold text-gray-900 mb-2" style={{ fontFamily: "Poppins_700Bold" }}>
            {title}
          </Text>
          <Text className="text-gray-500 mb-6" style={{ fontFamily: "Outfit_400Regular" }}>
            {subtitle}
          </Text>

          {loading ? (
            <View className="py-10 items-center justify-center">
              <ActivityIndicator />
              <Text className="text-gray-500 mt-3" style={{ fontFamily: "Outfit_400Regular" }}>
                {locale === "pt-BR" ? "Carregando…" : locale === "es" ? "Cargando…" : "Loading…"}
              </Text>
            </View>
          ) : (
            <View className="pb-12">
              <Text className="text-gray-700 leading-6" style={{ fontFamily: "Outfit_400Regular" }}>
                {content}
              </Text>
            </View>
          )}
        </Animated.View>
      </ScrollView>
    </View>
  );
}