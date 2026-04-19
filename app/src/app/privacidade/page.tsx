import type { Metadata } from "next";
import LegalShell from "@/components/LegalShell";

export const metadata: Metadata = {
  title: "Política de Privacidade — Alchemy Control Chart",
  description:
    "Como o Alchemy Control Chart coleta, trata e protege os dados do laboratório em conformidade com a LGPD.",
};

export default function PrivacidadePage() {
  return (
    <LegalShell
      title="Política de Privacidade"
      subtitle="Como tratamos e protegemos os dados do seu laboratório em conformidade com a Lei Geral de Proteção de Dados (LGPD — Lei 13.709/2018)."
      updatedAt="19 de abril de 2026"
    >
      <Section n="1" title="Controlador dos Dados">
        <p>
          O <strong>Alchemy Control Chart</strong> é operado pela <strong>Alchemypet</strong>, responsável
          pelo tratamento dos dados pessoais e técnicos armazenados na plataforma. Dúvidas relativas à
          LGPD, requisições de titulares ou incidentes de segurança devem ser encaminhadas ao e-mail do
          encarregado (DPO) informado pela Alchemypet.
        </p>
      </Section>

      <Section n="2" title="Dados que coletamos">
        <p>Armazenamos apenas o necessário para operar o controle de qualidade interno do laboratório:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li><strong>Conta e sessão:</strong> nome, e-mail, perfil de acesso, unidade vinculada e hash de senha.</li>
          <li><strong>Operação do CQI:</strong> equipamentos, materiais de controle, analitos, lotes, runs, violações de Westgard, intervenções e não-conformidades.</li>
          <li><strong>Auditoria:</strong> ações sensíveis (login, criação/edição/exclusão de cadastros, resoluções), com IP de origem e data/hora.</li>
          <li><strong>Telemetria técnica:</strong> cookies estritamente necessários para manter a sessão autenticada.</li>
        </ul>
        <p className="mt-3">
          <strong>Não coletamos dados clínicos de pacientes.</strong> A plataforma trata somente dados de controle
          interno do laboratório.
        </p>
      </Section>

      <Section n="3" title="Base legal e finalidades">
        <p>O tratamento ocorre com as seguintes bases legais da LGPD (art. 7º):</p>
        <ul className="list-disc pl-6 space-y-1">
          <li><strong>Execução de contrato</strong> — operar o serviço contratado pelo laboratório.</li>
          <li><strong>Cumprimento de obrigação legal/regulatória</strong> — manter registros de CQI auditáveis.</li>
          <li><strong>Legítimo interesse</strong> — segurança da plataforma, prevenção a fraude e registros de auditoria.</li>
        </ul>
      </Section>

      <Section n="4" title="Isolamento multi-tenant">
        <p>
          Cada laboratório (tenant) é isolado logicamente no banco de dados. Os acessos são filtrados por
          <code className="bg-gray-100 dark:bg-[#1f1f1f] px-1.5 py-0.5 rounded mx-1 text-sm">tenantId</code>
          em todas as consultas — nenhum usuário enxerga dados de outro laboratório.
        </p>
      </Section>

      <Section n="5" title="Compartilhamento">
        <p>Não vendemos nem compartilhamos dados com terceiros para fins de marketing. Usamos apenas:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li><strong>Provedor de infraestrutura</strong> — hospedagem do banco PostgreSQL e da aplicação.</li>
          <li><strong>Autoridades</strong> — quando houver ordem legal vinculante.</li>
        </ul>
      </Section>

      <Section n="6" title="Segurança">
        <ul className="list-disc pl-6 space-y-1">
          <li>Senhas armazenadas com hash <strong>bcrypt</strong> — nunca em texto claro.</li>
          <li>Sessões JWT curtas (8h) e rotacionáveis.</li>
          <li><strong>Rate limiting</strong> em login por IP e por e-mail contra força bruta.</li>
          <li>Cabeçalhos de segurança (CSP, HSTS, X-Frame-Options, Referrer-Policy) em todas as rotas.</li>
          <li>Política de senha forte: mínimo 10 caracteres e diversidade de classes.</li>
          <li>Logs de auditoria imutáveis de ações sensíveis.</li>
          <li>Transporte cifrado (TLS) obrigatório.</li>
        </ul>
      </Section>

      <Section n="7" title="Retenção">
        <p>
          Dados de CQI são retidos enquanto o contrato estiver ativo e por mais <strong>5 anos</strong> após o
          encerramento, conforme exigências regulatórias de rastreabilidade laboratorial. Logs de auditoria
          seguem a mesma retenção. Contas de usuário desativadas são marcadas como inativas (soft delete) e
          anonimizadas sob solicitação ao término do contrato.
        </p>
      </Section>

      <Section n="8" title="Direitos do titular (art. 18 da LGPD)">
        <p>Você pode, a qualquer momento, solicitar:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Confirmação da existência de tratamento.</li>
          <li>Acesso aos seus dados.</li>
          <li>Correção de dados incompletos, inexatos ou desatualizados.</li>
          <li>Anonimização, bloqueio ou eliminação de dados desnecessários ou excessivos.</li>
          <li>Portabilidade.</li>
          <li>Revogação do consentimento, quando aplicável.</li>
        </ul>
        <p className="mt-3">Para exercer esses direitos, entre em contato com o administrador do seu laboratório, que acionará o DPO da Alchemypet.</p>
      </Section>

      <Section n="9" title="Incidentes">
        <p>
          Em caso de incidente de segurança com risco relevante aos titulares, a Alchemypet comunicará a
          ANPD e os afetados em prazo razoável, conforme o art. 48 da LGPD.
        </p>
      </Section>

      <Section n="10" title="Alterações">
        <p>
          Esta política pode ser atualizada para refletir mudanças técnicas, legais ou contratuais. A data
          de atualização é exibida no topo deste documento.
        </p>
      </Section>
    </LegalShell>
  );
}

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="scroll-mt-20">
      <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white flex items-baseline gap-3 mb-3">
        <span className="text-[#b38d03] font-mono text-sm">{n}.</span>
        {title}
      </h2>
      <div className="space-y-3 text-gray-700 dark:text-gray-300">{children}</div>
    </section>
  );
}
