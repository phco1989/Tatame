/**
 * Global Legal Documents
 *
 * These are app-owner responsibility legal documents that apply across all schools.
 * They are stored in code as constants with support for 3 languages: en, es, pt.
 *
 * Placeholders supported:
 * - {APP_NAME} - The app name
 * - {SUPPORT_EMAIL} - Support email address
 * - {COMPANY_NAME} - Company/organization name
 * - {EFFECTIVE_DATE} - When the terms become effective
 */

import type { Locale } from "../i18n/translations";

// App configuration for placeholders
export const APP_CONFIG = {
  APP_NAME: "Tatame",
  SUPPORT_EMAIL: "support@tatame.com",
  COMPANY_NAME: "Tatame",
  EFFECTIVE_DATE: "January 1, 2025",
};

export interface GlobalLegalDocument {
  title: Record<Locale, string>;
  content: Record<Locale, string>;
  version: string;
  lastUpdated: string;
}

/**
 * Replace placeholders in legal text with actual values
 */
export function replacePlaceholders(text: string): string {
  return text
    .replace(/\{APP_NAME\}/g, APP_CONFIG.APP_NAME)
    .replace(/\{SUPPORT_EMAIL\}/g, APP_CONFIG.SUPPORT_EMAIL)
    .replace(/\{COMPANY_NAME\}/g, APP_CONFIG.COMPANY_NAME)
    .replace(/\{EFFECTIVE_DATE\}/g, APP_CONFIG.EFFECTIVE_DATE);
}

/**
 * Get localized legal document content with placeholders replaced
 */
export function getLocalizedLegalContent(
  document: GlobalLegalDocument,
  locale: Locale
): { title: string; content: string; version: string; lastUpdated: string } {
  return {
    title: replacePlaceholders(document.title[locale] || document.title.en),
    content: replacePlaceholders(document.content[locale] || document.content.en),
    version: document.version,
    lastUpdated: document.lastUpdated,
  };
}

// ============================================================================
// PRIVACY POLICY
// ============================================================================

export const PRIVACY_POLICY: GlobalLegalDocument = {
  version: "1.0.0",
  lastUpdated: "2025-01-01",
  title: {
    en: "Privacy Policy",
    es: "Política de Privacidad",
    "pt-BR": "Política de Privacidade",
  },
  content: {
    en: `# Privacy Policy

**Effective Date:** {EFFECTIVE_DATE}

{COMPANY_NAME} ("we", "us", or "our") operates the {APP_NAME} mobile application (the "Service"). This page informs you of our policies regarding the collection, use, and disclosure of personal data when you use our Service.

## 1. Information We Collect

### Personal Information
When you use {APP_NAME}, we may collect:
- **Account Information:** Name, email address, phone number
- **Profile Information:** Age, height, weight, swimming ability, medical conditions
- **Booking Information:** Lesson preferences, scheduling data, payment records
- **Usage Data:** App interactions, device information, IP address

### Automatically Collected Information
We automatically collect certain information when you use the Service:
- Device type and operating system
- App usage statistics
- Crash reports and performance data

## 2. How We Use Your Information

We use collected information to:
- Provide and maintain the Service
- Process bookings and payments
- Send notifications about your lessons
- Improve our services and user experience
- Comply with legal obligations
- Ensure safety during Jiu-Jitsu activities

## 3. Data Sharing

We may share your information with:
- **School Operators:** Your assigned Jiu-Jitsu academy to facilitate lessons
- **Coaches:** Instructors assigned to your sessions
- **Service Providers:** Third parties who assist in operating our Service
- **Legal Requirements:** When required by law or to protect our rights

We do NOT sell your personal information to third parties.

## 4. Data Security

We implement appropriate technical and organizational measures to protect your personal data against unauthorized access, alteration, disclosure, or destruction.

## 5. Data Retention

We retain your personal information for as long as necessary to provide the Service and fulfill the purposes described in this policy. You may request deletion of your data at any time.

## 6. Your Rights

You have the right to:
- Access your personal data
- Correct inaccurate data
- Request deletion of your data
- Object to data processing
- Data portability

To exercise these rights, contact us at {SUPPORT_EMAIL}.

## 7. Children's Privacy

Our Service is not intended for children under 13. We do not knowingly collect personal information from children under 13.

## 8. Changes to This Policy

We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new policy on this page and updating the "Effective Date."

## 9. Contact Us

If you have questions about this Privacy Policy, please contact us:
- Email: {SUPPORT_EMAIL}

---

By using {APP_NAME}, you acknowledge that you have read and understood this Privacy Policy.`,

    es: `# Política de Privacidad

**Fecha de Vigencia:** {EFFECTIVE_DATE}

{COMPANY_NAME} ("nosotros" o "nuestro") opera la aplicación móvil {APP_NAME} (el "Servicio"). Esta página le informa sobre nuestras políticas con respecto a la recopilación, uso y divulgación de datos personales cuando utiliza nuestro Servicio.

## 1. Información que Recopilamos

### Información Personal
Cuando utiliza {APP_NAME}, podemos recopilar:
- **Información de Cuenta:** Nombre, dirección de correo electrónico, número de teléfono
- **Información de Perfil:** Edad, altura, peso, capacidad de natación, condiciones médicas
- **Información de Reservas:** Preferencias de clases, datos de programación, registros de pago
- **Datos de Uso:** Interacciones con la app, información del dispositivo, dirección IP

### Información Recopilada Automáticamente
Recopilamos automáticamente cierta información cuando utiliza el Servicio:
- Tipo de dispositivo y sistema operativo
- Estadísticas de uso de la app
- Informes de errores y datos de rendimiento

## 2. Cómo Usamos Su Información

Utilizamos la información recopilada para:
- Proporcionar y mantener el Servicio
- Procesar reservas y pagos
- Enviar notificaciones sobre sus clases
- Mejorar nuestros servicios y experiencia de usuario
- Cumplir con obligaciones legales
- Garantizar la seguridad durante las actividades de Jiu-Jitsu

## 3. Compartir Datos

Podemos compartir su información con:
- **Operadores de Escuelas:** Su academia de Jiu-Jitsu asignada para facilitar las clases
- **Coaches:** Instructores asignados a sus sesiones
- **Proveedores de Servicios:** Terceros que ayudan a operar nuestro Servicio
- **Requisitos Legales:** Cuando sea requerido por ley o para proteger nuestros derechos

NO vendemos su información personal a terceros.

## 4. Seguridad de Datos

Implementamos medidas técnicas y organizativas apropiadas para proteger sus datos personales contra acceso no autorizado, alteración, divulgación o destrucción.

## 5. Retención de Datos

Retenemos su información personal durante el tiempo necesario para proporcionar el Servicio y cumplir con los propósitos descritos en esta política. Puede solicitar la eliminación de sus datos en cualquier momento.

## 6. Sus Derechos

Usted tiene derecho a:
- Acceder a sus datos personales
- Corregir datos inexactos
- Solicitar la eliminación de sus datos
- Oponerse al procesamiento de datos
- Portabilidad de datos

Para ejercer estos derechos, contáctenos en {SUPPORT_EMAIL}.

## 7. Privacidad de Menores

Nuestro Servicio no está destinado a menores de 13 años. No recopilamos conscientemente información personal de menores de 13 años.

## 8. Cambios a Esta Política

Podemos actualizar esta Política de Privacidad de vez en cuando. Le notificaremos cualquier cambio publicando la nueva política en esta página y actualizando la "Fecha de Vigencia."

## 9. Contáctenos

Si tiene preguntas sobre esta Política de Privacidad, contáctenos:
- Email: {SUPPORT_EMAIL}

---

Al usar {APP_NAME}, reconoce que ha leído y entendido esta Política de Privacidad.`,

    "pt-BR": `# Política de Privacidade

**Data de Vigência:** {EFFECTIVE_DATE}

{COMPANY_NAME} ("nós" ou "nosso") opera o aplicativo móvel {APP_NAME} (o "Serviço"). Esta página informa você sobre nossas políticas relativas à coleta, uso e divulgação de dados pessoais quando você usa nosso Serviço.

## 1. Informações que Coletamos

### Informações Pessoais
Quando você usa o {APP_NAME}, podemos coletar:
- **Informações da Conta:** Nome, endereço de e-mail, número de telefone
- **Informações do Perfil:** Idade, altura, peso, habilidade de natação, condições médicas
- **Informações de Reservas:** Preferências de aulas, dados de agendamento, registros de pagamento
- **Dados de Uso:** Interações com o app, informações do dispositivo, endereço IP

### Informações Coletadas Automaticamente
Coletamos automaticamente certas informações quando você usa o Serviço:
- Tipo de dispositivo e sistema operacional
- Estatísticas de uso do app
- Relatórios de erros e dados de desempenho

## 2. Como Usamos Suas Informações

Usamos as informações coletadas para:
- Fornecer e manter o Serviço
- Processar reservas e pagamentos
- Enviar notificações sobre suas aulas
- Melhorar nossos serviços e experiência do usuário
- Cumprir obrigações legais
- Garantir segurança durante as atividades de Jiu-Jitsu

## 3. Compartilhamento de Dados

Podemos compartilhar suas informações com:
- **Operadores de Escolas:** Sua academia de Jiu-Jitsu designada para facilitar as aulas
- **Coaches:** Instrutores designados para suas sessões
- **Provedores de Serviços:** Terceiros que ajudam a operar nosso Serviço
- **Requisitos Legais:** Quando exigido por lei ou para proteger nossos direitos

NÃO vendemos suas informações pessoais a terceiros.

## 4. Segurança de Dados

Implementamos medidas técnicas e organizacionais apropriadas para proteger seus dados pessoais contra acesso não autorizado, alteração, divulgação ou destruição.

## 5. Retenção de Dados

Retemos suas informações pessoais pelo tempo necessário para fornecer o Serviço e cumprir os propósitos descritos nesta política. Você pode solicitar a exclusão de seus dados a qualquer momento.

## 6. Seus Direitos

Você tem o direito de:
- Acessar seus dados pessoais
- Corrigir dados imprecisos
- Solicitar a exclusão de seus dados
- Opor-se ao processamento de dados
- Portabilidade de dados

Para exercer esses direitos, entre em contato conosco em {SUPPORT_EMAIL}.

## 7. Privacidade de Menores

Nosso Serviço não é destinado a menores de 13 anos. Não coletamos conscientemente informações pessoais de menores de 13 anos.

## 8. Alterações nesta Política

Podemos atualizar esta Política de Privacidade de tempos em tempos. Notificaremos você sobre quaisquer alterações publicando a nova política nesta página e atualizando a "Data de Vigência."

## 9. Fale Conosco

Se você tiver dúvidas sobre esta Política de Privacidade, entre em contato:
- Email: {SUPPORT_EMAIL}

---

Ao usar o {APP_NAME}, você reconhece que leu e entendeu esta Política de Privacidade.`,
  },
};

// ============================================================================
// TERMS OF SERVICE
// ============================================================================

export const TERMS_OF_SERVICE: GlobalLegalDocument = {
  version: "1.0.0",
  lastUpdated: "2025-01-01",
  title: {
    en: "Terms of Service",
    es: "Términos de Servicio",
    "pt-BR": "Termos de Serviço",
  },
  content: {
    en: `# Terms of Service

**Effective Date:** {EFFECTIVE_DATE}

Welcome to {APP_NAME}! These Terms of Service ("Terms") govern your use of the {APP_NAME} mobile application operated by {COMPANY_NAME}.

By accessing or using {APP_NAME}, you agree to be bound by these Terms.

## 1. Acceptance of Terms

By creating an account or using {APP_NAME}, you confirm that:
- You are at least 18 years old, or have parental consent
- You have read and agree to these Terms
- You have read and agree to our Privacy Policy

## 2. Description of Service

{APP_NAME} is a platform that connects Jiu-Jitsu students with schools and instructors. The Service includes:
- Booking and managing Jiu-Jitsu lessons
- Tracking learning progress and skills
- Communication with schools and coaches
- Managing waivers and legal documents

## 3. User Accounts

### Account Creation
You must provide accurate and complete information when creating an account. You are responsible for maintaining the confidentiality of your account credentials.

### Account Responsibilities
You agree to:
- Keep your login information secure
- Notify us immediately of unauthorized access
- Be responsible for all activities under your account

## 4. Booking and Payments

### Lesson Bookings
- All bookings are subject to availability
- Prices are set by individual schools
- Payment is collected at the time of service or as specified by the school

### Cancellations
Cancellation policies are determined by each school. Please review the school's specific cancellation policy before booking.

## 5. Safety and Waivers

### Assumption of Risk
Jiu-Jitsu is a contact sport with inherent risks. By using our Service to book lessons, you acknowledge these risks.

### Waiver Requirements
You may be required to sign a waiver before participating in lessons. Electronic signatures are legally binding.

## 6. User Conduct

You agree NOT to:
- Use the Service for any illegal purpose
- Harass, abuse, or harm other users
- Impersonate others or provide false information
- Attempt to gain unauthorized access to the Service
- Upload malicious content or viruses

## 7. Intellectual Property

All content, features, and functionality of {APP_NAME} are owned by {COMPANY_NAME} and are protected by copyright, trademark, and other intellectual property laws.

## 8. Disclaimer of Warranties

{APP_NAME} is provided "AS IS" without warranties of any kind. We do not guarantee:
- Uninterrupted or error-free service
- Accuracy of information provided by schools
- Quality of lessons provided by third-party schools

## 9. Limitation of Liability

To the maximum extent permitted by law, {COMPANY_NAME} shall not be liable for:
- Indirect, incidental, or consequential damages
- Personal injury during Jiu-Jitsu activities
- Actions or omissions of third-party schools or instructors

## 10. Indemnification

You agree to indemnify and hold harmless {COMPANY_NAME} from any claims arising from:
- Your use of the Service
- Your violation of these Terms
- Your participation in Jiu-Jitsu activities

## 11. Modifications

We reserve the right to modify these Terms at any time. Continued use of the Service after changes constitutes acceptance of the new Terms.

## 12. Termination

We may terminate or suspend your account at any time for violations of these Terms or for any other reason at our discretion.

## 13. Governing Law

These Terms shall be governed by and construed in accordance with the laws of the jurisdiction in which {COMPANY_NAME} operates.

## 14. Contact Us

For questions about these Terms, please contact us:
- Email: {SUPPORT_EMAIL}

---

By using {APP_NAME}, you acknowledge that you have read, understood, and agree to be bound by these Terms of Service.`,

    es: `# Términos de Servicio

**Fecha de Vigencia:** {EFFECTIVE_DATE}

¡Bienvenido a {APP_NAME}! Estos Términos de Servicio ("Términos") rigen su uso de la aplicación móvil {APP_NAME} operada por {COMPANY_NAME}.

Al acceder o usar {APP_NAME}, acepta estar sujeto a estos Términos.

## 1. Aceptación de Términos

Al crear una cuenta o usar {APP_NAME}, confirma que:
- Tiene al menos 18 años, o tiene consentimiento parental
- Ha leído y acepta estos Términos
- Ha leído y acepta nuestra Política de Privacidad

## 2. Descripción del Servicio

{APP_NAME} es una plataforma que conecta estudiantes de Jiu-Jitsu con escuelas e instructores. El Servicio incluye:
- Reserva y gestión de clases de Jiu-Jitsu
- Seguimiento del progreso y habilidades de aprendizaje
- Comunicación con escuelas y coaches
- Gestión de acuerdos y documentos legales

## 3. Cuentas de Usuario

### Creación de Cuenta
Debe proporcionar información precisa y completa al crear una cuenta. Es responsable de mantener la confidencialidad de sus credenciales.

### Responsabilidades de la Cuenta
Acepta:
- Mantener su información de inicio de sesión segura
- Notificarnos inmediatamente de acceso no autorizado
- Ser responsable de todas las actividades bajo su cuenta

## 4. Reservas y Pagos

### Reservas de Clases
- Todas las reservas están sujetas a disponibilidad
- Los precios son establecidos por las escuelas individuales
- El pago se recoge en el momento del servicio o según lo especifique la escuela

### Cancelaciones
Las políticas de cancelación son determinadas por cada escuela. Por favor revise la política de cancelación específica de la escuela antes de reservar.

## 5. Seguridad y Acuerdos

### Asunción de Riesgo
El Jiu-Jitsu es un deporte de contacto con riesgos inherentes. Al usar nuestro Servicio para reservar clases, reconoce estos riesgos.

### Requisitos de Acuerdo
Puede ser requerido firmar un acuerdo antes de participar en las clases. Las firmas electrónicas son legalmente vinculantes.

## 6. Conducta del Usuario

Acepta NO:
- Usar el Servicio para ningún propósito ilegal
- Acosar, abusar o dañar a otros usuarios
- Hacerse pasar por otros o proporcionar información falsa
- Intentar obtener acceso no autorizado al Servicio
- Subir contenido malicioso o virus

## 7. Propiedad Intelectual

Todo el contenido, características y funcionalidad de {APP_NAME} son propiedad de {COMPANY_NAME} y están protegidos por derechos de autor, marcas registradas y otras leyes de propiedad intelectual.

## 8. Descargo de Garantías

{APP_NAME} se proporciona "TAL CUAL" sin garantías de ningún tipo. No garantizamos:
- Servicio ininterrumpido o sin errores
- Precisión de la información proporcionada por las escuelas
- Calidad de las clases proporcionadas por escuelas de terceros

## 9. Limitación de Responsabilidad

En la máxima medida permitida por la ley, {COMPANY_NAME} no será responsable de:
- Daños indirectos, incidentales o consecuentes
- Lesiones personales durante actividades de Jiu-Jitsu
- Acciones u omisiones de escuelas o instructores de terceros

## 10. Indemnización

Acepta indemnizar y mantener indemne a {COMPANY_NAME} de cualquier reclamo derivado de:
- Su uso del Servicio
- Su violación de estos Términos
- Su participación en actividades de Jiu-Jitsu

## 11. Modificaciones

Nos reservamos el derecho de modificar estos Términos en cualquier momento. El uso continuado del Servicio después de los cambios constituye aceptación de los nuevos Términos.

## 12. Terminación

Podemos terminar o suspender su cuenta en cualquier momento por violaciones de estos Términos o por cualquier otra razón a nuestra discreción.

## 13. Ley Aplicable

Estos Términos se regirán e interpretarán de acuerdo con las leyes de la jurisdicción en la que opera {COMPANY_NAME}.

## 14. Contáctenos

Para preguntas sobre estos Términos, contáctenos:
- Email: {SUPPORT_EMAIL}

---

Al usar {APP_NAME}, reconoce que ha leído, entendido y acepta estar sujeto a estos Términos de Servicio.`,

    "pt-BR": `# Termos de Serviço

**Data de Vigência:** {EFFECTIVE_DATE}

Bem-vindo ao {APP_NAME}! Estes Termos de Serviço ("Termos") regem o uso do aplicativo móvel {APP_NAME} operado por {COMPANY_NAME}.

Ao acessar ou usar o {APP_NAME}, você concorda em estar vinculado a estes Termos.

## 1. Aceitação dos Termos

Ao criar uma conta ou usar o {APP_NAME}, você confirma que:
- Tem pelo menos 18 anos, ou tem consentimento dos pais
- Leu e concorda com estes Termos
- Leu e concorda com nossa Política de Privacidade

## 2. Descrição do Serviço

{APP_NAME} é uma plataforma que conecta alunos de Jiu-Jitsu com escolas e instrutores. O Serviço inclui:
- Reserva e gerenciamento de aulas de Jiu-Jitsu
- Acompanhamento do progresso e habilidades de aprendizado
- Comunicação com escolas e coaches
- Gerenciamento de termos e documentos legais

## 3. Contas de Usuário

### Criação de Conta
Você deve fornecer informações precisas e completas ao criar uma conta. Você é responsável por manter a confidencialidade de suas credenciais.

### Responsabilidades da Conta
Você concorda em:
- Manter suas informações de login seguras
- Nos notificar imediatamente sobre acesso não autorizado
- Ser responsável por todas as atividades em sua conta

## 4. Reservas e Pagamentos

### Reservas de Aulas
- Todas as reservas estão sujeitas à disponibilidade
- Os preços são definidos pelas escolas individuais
- O pagamento é coletado no momento do serviço ou conforme especificado pela escola

### Cancelamentos
As políticas de cancelamento são determinadas por cada escola. Por favor, revise a política de cancelamento específica da escola antes de reservar.

## 5. Segurança e Termos

### Assunção de Risco
O Jiu-Jitsu é um esporte de contato com riscos inerentes. Ao usar nosso Serviço para reservar aulas, você reconhece esses riscos.

### Requisitos de Termo
Pode ser necessário assinar um termo antes de participar das aulas. Assinaturas eletrônicas são juridicamente vinculativas.

## 6. Conduta do Usuário

Você concorda em NÃO:
- Usar o Serviço para qualquer propósito ilegal
- Assediar, abusar ou prejudicar outros usuários
- Se passar por outros ou fornecer informações falsas
- Tentar obter acesso não autorizado ao Serviço
- Carregar conteúdo malicioso ou vírus

## 7. Propriedade Intelectual

Todo o conteúdo, recursos e funcionalidades do {APP_NAME} são de propriedade da {COMPANY_NAME} e são protegidos por direitos autorais, marcas registradas e outras leis de propriedade intelectual.

## 8. Isenção de Garantias

O {APP_NAME} é fornecido "COMO ESTÁ" sem garantias de qualquer tipo. Não garantimos:
- Serviço ininterrupto ou sem erros
- Precisão das informações fornecidas pelas escolas
- Qualidade das aulas fornecidas por escolas terceiras

## 9. Limitação de Responsabilidade

Na máxima extensão permitida por lei, a {COMPANY_NAME} não será responsável por:
- Danos indiretos, incidentais ou consequentes
- Lesões pessoais durante atividades de Jiu-Jitsu
- Ações ou omissões de escolas ou instrutores terceiros

## 10. Indenização

Você concorda em indenizar e isentar a {COMPANY_NAME} de quaisquer reclamações decorrentes de:
- Seu uso do Serviço
- Sua violação destes Termos
- Sua participação em atividades de Jiu-Jitsu

## 11. Modificações

Reservamo-nos o direito de modificar estes Termos a qualquer momento. O uso continuado do Serviço após as alterações constitui aceitação dos novos Termos.

## 12. Rescisão

Podemos encerrar ou suspender sua conta a qualquer momento por violações destes Termos ou por qualquer outro motivo a nosso critério.

## 13. Lei Aplicável

Estes Termos serão regidos e interpretados de acordo com as leis da jurisdição em que a {COMPANY_NAME} opera.

## 14. Fale Conosco

Para perguntas sobre estes Termos, entre em contato:
- Email: {SUPPORT_EMAIL}

---

Ao usar o {APP_NAME}, você reconhece que leu, entendeu e concorda em estar vinculado a estes Termos de Serviço.`,
  },
};
