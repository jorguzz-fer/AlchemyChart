import type { Metadata } from "next";
import LegalShell from "@/components/LegalShell";

export const metadata: Metadata = {
  title: "Termos de Uso — Alchemy Control Chart",
  description:
    "Termos e condições de uso da plataforma Alchemy Control Chart para laboratórios clínicos e veterinários.",
};

export default function TermosPage() {
  return (
    <LegalShell
      title="Termos de Uso"
      subtitle="Condições que regem o acesso e a utilização da plataforma Alchemy Control Chart pelos laboratórios contratantes e seus usuários."
      updatedAt="19 de abril de 2026"
    >
      <Section n="1" title="Aceitação">
        <p>
          Ao acessar ou utilizar o <strong>Alchemy Control Chart</strong> (&ldquo;Plataforma&rdquo;), o usuário declara ter
          lido, compreendido e concordado integralmente com estes Termos e com a
          <a href="/privacidade" className="text-[#b38d03] hover:underline mx-1">Política de Privacidade</a>. O uso
          da Plataforma sem concordância é vedado.
        </p>
      </Section>

      <Section n="2" title="Objeto">
        <p>
          A Plataforma oferece recursos de <strong>Controle de Qualidade Interno (CQI)</strong> para
          laboratórios clínicos e veterinários, incluindo:
        </p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Cadastro de equipamentos, materiais de controle, lotes e analitos;</li>
          <li>Registro de runs de controle e cálculo de estatísticas (média, DP, CV);</li>
          <li>Gráficos Levey-Jennings e avaliação pelas <strong>regras de Westgard</strong>;</li>
          <li>Gestão de não-conformidades, intervenções e relatórios.</li>
        </ul>
        <p className="mt-3">
          A Plataforma <strong>não substitui</strong> o julgamento técnico do profissional habilitado. Decisões
          clínicas, de liberação de resultados ou de ação corretiva são responsabilidade do laboratório.
        </p>
      </Section>

      <Section n="3" title="Conta e credenciais">
        <ul className="list-disc pl-6 space-y-1">
          <li>O laboratório é responsável por cadastrar e administrar os usuários do seu tenant.</li>
          <li>As credenciais são pessoais e intransferíveis — compartilhá-las é violação destes Termos.</li>
          <li>O titular da conta deve informar imediatamente o administrador em caso de suspeita de acesso indevido.</li>
          <li>A Alchemypet pode exigir troca de senha, revogar sessões e desativar contas diante de indícios de uso abusivo.</li>
        </ul>
      </Section>

      <Section n="4" title="Perfis de acesso">
        <ul className="list-disc pl-6 space-y-1">
          <li><strong>ADMIN</strong> — administra usuários, cadastros e configurações do laboratório.</li>
          <li><strong>SUPERVISOR</strong> — gerencia cadastros e resolve não-conformidades.</li>
          <li><strong>ANALYST</strong> — registra runs e acompanha o CQI.</li>
          <li><strong>VIEWER</strong> — consulta leituras e relatórios.</li>
        </ul>
      </Section>

      <Section n="5" title="Uso aceitável">
        <p>É vedado ao usuário:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Tentar acessar dados de outro laboratório (tenant) sem autorização;</li>
          <li>Realizar engenharia reversa, varredura automatizada ou testes de intrusão sem autorização formal;</li>
          <li>Enviar conteúdo ilícito, ofensivo ou que viole direitos de terceiros;</li>
          <li>Utilizar a Plataforma para finalidades diversas de controle de qualidade laboratorial;</li>
          <li>Inserir intencionalmente dados falsos com o objetivo de fraudar registros de CQI.</li>
        </ul>
        <p className="mt-3">
          A violação destas regras pode resultar em <strong>suspensão imediata</strong> do acesso e nas sanções
          cíveis e criminais aplicáveis.
        </p>
      </Section>

      <Section n="6" title="Propriedade intelectual">
        <p>
          A marca, o código, o design, os textos, a lógica de regras de Westgard implementada e demais
          elementos da Plataforma são de titularidade exclusiva da <strong>Alchemypet</strong> e/ou seus
          licenciadores. Nenhuma cláusula destes Termos transfere direitos de propriedade intelectual ao
          contratante.
        </p>
        <p>
          Os dados inseridos pelo laboratório permanecem de sua titularidade. A Alchemypet os trata
          exclusivamente para prestar o serviço.
        </p>
      </Section>

      <Section n="7" title="Disponibilidade e manutenção">
        <p>
          A Alchemypet empreenderá esforços razoáveis para manter a Plataforma disponível, mas não
          garante funcionamento ininterrupto ou isento de erros. Paradas programadas para manutenção e
          atualizações de segurança poderão ocorrer, preferencialmente com aviso prévio.
        </p>
      </Section>

      <Section n="8" title="Limitação de responsabilidade">
        <p>
          Na máxima extensão permitida pela legislação aplicável, a Alchemypet não se responsabiliza por
          lucros cessantes, perdas indiretas ou danos decorrentes de:
        </p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Uso inadequado da Plataforma ou de suas saídas;</li>
          <li>Falhas de conectividade ou de hardware do contratante;</li>
          <li>Decisões técnicas tomadas exclusivamente com base em dados da Plataforma, sem validação humana qualificada;</li>
          <li>Eventos de força maior.</li>
        </ul>
      </Section>

      <Section n="9" title="Dados e segurança">
        <p>
          O tratamento de dados segue a
          <a href="/privacidade" className="text-[#b38d03] hover:underline mx-1">Política de Privacidade</a>
          e a LGPD. Em caso de rescisão, os dados poderão ser exportados e, em seguida, eliminados após o
          período de retenção regulatório.
        </p>
      </Section>

      <Section n="10" title="Alterações dos Termos">
        <p>
          Estes Termos podem ser atualizados a qualquer tempo. A versão vigente está sempre publicada
          nesta página, com a data de atualização indicada no topo. O uso continuado após mudanças
          significa aceitação da nova versão.
        </p>
      </Section>

      <Section n="11" title="Foro">
        <p>
          Fica eleito o foro da comarca da sede da Alchemypet para dirimir questões oriundas destes
          Termos, com renúncia a qualquer outro, por mais privilegiado que seja.
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
