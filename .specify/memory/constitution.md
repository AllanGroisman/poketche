<!--
Sync Impact Report
- Version change: (template) → 1.0.0
- Modified principles: n/a (adoção inicial — todos os placeholders do template preenchidos)
- Added sections:
  - Core Principles (6 princípios: Qualidade Testada, Simplicidade Primeiro,
    MVP Incremental, Dinheiro é Crítico, Isolamento de Dados de Terceiros,
    UX Mobile-First)
  - Restrições Adicionais
  - Fluxo de Desenvolvimento
  - Governance
- Removed sections: nenhuma
- Templates requiring updates:
  - ✅ .specify/templates/plan-template.md — Constitution Check é preenchido
    dinamicamente a partir deste arquivo; nenhuma alteração estrutural necessária
  - ✅ .specify/templates/spec-template.md — compatível (user stories
    independentes já são exigidas pelo template)
  - ✅ .specify/templates/tasks-template.md — compatível (organização por user
    story alinha com Princípio III)
- Follow-up TODOs: nenhum
-->

# Poketchê Constitution

## Core Principles

### I. Qualidade Testada

Toda lógica de negócio crítica MUST ter testes automatizados antes de ser considerada
concluída. São consideradas críticas, no mínimo: cálculo e exibição de preços, transações
do marketplace (criação, confirmação, cancelamento) e cálculo de comissões. Código de UI e
funcionalidades não críticas MAY ser testado de forma mais leve, mas nenhuma user story é
"done" sem que sua lógica de negócio central esteja coberta por testes que rodam em CI ou
localmente de forma reproduzível.

**Rationale**: preços, transações e comissões são o coração do produto; regressões nessas
áreas causam prejuízo financeiro direto a usuários e ao negócio.

### II. Simplicidade Primeiro

Sempre preferir bibliotecas, serviços e padrões bem estabelecidos em vez de implementações
customizadas. Soluções caseiras para problemas já resolvidos (autenticação, pagamentos,
armazenamento, filas, cache) MUST ser justificadas por escrito no plano antes de serem
adotadas. Não over-engineer: nenhuma abstração, camada ou generalização é adicionada
antes de existir uma necessidade concreta (YAGNI). Violações identificadas em revisão
MUST ser registradas na tabela de Complexity Tracking do plano ou removidas.

**Rationale**: o time é pequeno e o objetivo é entregar um MVP; cada linha de código
customizado é custo de manutenção que atrasa o produto.

### III. MVP Incremental

Cada user story MUST ser entregável e testável de forma independente — implementada,
demonstrável e verificável sem depender de stories futuras. Funcionalidades complexas ou
de alto risco (como detecção de cartas por câmera) MUST ser isoladas de modo que sua
ausência, atraso ou falha não bloqueie o restante do app; o fluxo principal MUST sempre
oferecer um caminho alternativo (ex.: busca manual em vez de câmera). Priorização segue
P1 → P2 → P3, e o app deve permanecer utilizável ao final de cada story concluída.

**Rationale**: entregas incrementais reduzem risco, permitem feedback cedo e evitam que
apostas tecnológicas arriscadas travem o lançamento.

### IV. Dinheiro é Crítico (NON-NEGOTIABLE)

Qualquer código que envolva transações, pagamentos ou comissões MUST: (a) validar
rigorosamente entradas e estados antes de efetivar qualquer operação; (b) tratar todos os
caminhos de erro explicitamente — falhas de pagamento nunca podem deixar o sistema em
estado inconsistente; (c) registrar trilha de auditoria imutável (quem, o quê, quando,
valores, estado anterior e posterior) para toda mutação financeira; (d) usar valores
monetários com tipos apropriados (inteiros em centavos ou decimais exatos — nunca float
binário); (e) ser idempotente onde houver risco de retry. Revisões de código que tocam
dinheiro MUST verificar esses cinco pontos explicitamente.

**Rationale**: erros financeiros destroem a confiança no marketplace e podem gerar
passivo legal; auditabilidade é pré-requisito para resolver disputas.

### V. Isolamento de Dados de Terceiros

Integrações com fontes externas de preços (e quaisquer APIs de terceiros) MUST ser
isoladas em camadas próprias (adapter/gateway), atrás de uma interface controlada pelo
projeto. Cada integração MUST ter: cache com tempo de vida definido, fallback documentado
para quando a fonte estiver indisponível, e tratamento explícito para mudanças de formato
ou dados inválidos. O restante do app MUST NOT conhecer detalhes do provedor externo —
trocar de fonte de preços não pode exigir mudanças fora da camada de integração.

**Rationale**: fontes externas de preços podem falhar, mudar contrato ou ser
descontinuadas; o app precisa continuar funcional e a troca de fornecedor precisa ser
barata.

### VI. UX Mobile-First

O app é primariamente mobile, para iOS e Android. Toda funcionalidade MUST ser projetada
primeiro para a experiência mobile: interface simples, fluxos curtos e resposta rápida.
Telas MUST priorizar a ação principal do usuário, evitar formulários longos e funcionar
bem em conexões instáveis (estados de loading, erro e retry sempre presentes). Decisões
de design que degradem a experiência mobile em favor de outra plataforma MUST ser
rejeitadas ou justificadas no plano.

**Rationale**: o público-alvo usa o app em movimento (eventos, lojas, trocas presenciais);
velocidade e simplicidade são o diferencial competitivo.

## Restrições Adicionais

- Segredos (chaves de API, credenciais de pagamento) MUST NOT ser commitados; usar
  variáveis de ambiente ou serviço de secrets.
- Dependências novas MUST ser bem estabelecidas (manutenção ativa, adoção relevante);
  bibliotecas abandonadas ou experimentais exigem justificativa no plano.
- Dados pessoais e financeiros de usuários MUST ser tratados conforme a LGPD; coletar o
  mínimo necessário.
- Funcionalidades que dependem de hardware (câmera, notificações) MUST degradar
  graciosamente quando a permissão for negada.

## Fluxo de Desenvolvimento

- Toda feature passa pelo fluxo spec → plan → tasks → implement, com o Constitution Check
  do plano validado antes da implementação.
- Código que toca dinheiro (Princípio IV) MUST ser revisado com atenção explícita aos
  cinco pontos do princípio antes de merge.
- Testes da lógica crítica MUST passar antes de qualquer merge; uma story só é concluída
  quando é demonstrável de forma independente (Princípio III).
- Violações de simplicidade (Princípio II) encontradas em revisão MUST ser justificadas
  na tabela de Complexity Tracking ou corrigidas.

## Governance

Esta constituição prevalece sobre quaisquer outras práticas do projeto. Emendas exigem:
(1) proposta documentada com justificativa, (2) atualização deste arquivo com incremento
de versão semântica, e (3) propagação para os templates dependentes em
`.specify/templates/`. Versionamento: MAJOR para remoção ou redefinição incompatível de
princípios; MINOR para novo princípio ou expansão material de orientação; PATCH para
clarificações e correções de texto. Todo plano de feature MUST passar pelo Constitution
Check, e revisões de código MUST verificar conformidade com os princípios aplicáveis;
desvios só são aceitos se justificados na tabela de Complexity Tracking do plano.

**Version**: 1.0.0 | **Ratified**: 2026-07-10 | **Last Amended**: 2026-07-10
