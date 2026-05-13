# ChatBot ITSD | Assistente de Suporte de TI 🤖

Um motor de chatbot inteligente desenvolvido para atuar como Nível 1 no IT Service Desk, focado em interpretar as intenções do usuário e realizar o roteamento preciso para o serviço correto.

##   Sobre o Projeto
Este projeto nasceu da necessidade de otimizar o fluxo de chamados de TI, substituindo árvores de decisão lentas por um **Rule-Based Expert System** rodando diretamente no navegador. O bot processa a linguagem do usuário, tolera erros de digitação e aplica um sistema de pontuação (Score) para encontrar o serviço correto entre 87 opções mapeadas.

##   Arquitetura e Tecnologias
O projeto foi construído com Vanilla JavaScript, HTML5 e CSS3, sem dependências pesadas, focando em performance.

* **Fuzzy Search (Distância de Levenshtein):** Implementação de algoritmo de Processamento de Linguagem Natural (NLP) no frontend para tolerância a erros de digitação (ex: identificar "impresora" como "impressora").
* **Sistema de Pontuação de Regras:** Roteamento dinâmico que avalia a frase inteira. Padrões complexos (Regex) possuem peso alto, enquanto correspondências parciais possuem pesos ajustados para evitar falsos positivos.
* **Desacoplamento de Dados:** Os serviços e palavras-chave estão isolados em um arquivo `dados.js`, simulando a resposta de um banco de dados e protegendo a lógica principal.
* **Integração com IA (Mock/Fallback):** Integração desenhada para consumir a API da **Claude (Anthropic)** em casos onde o motor de regras local não atinge a pontuação mínima de confiança. *(Nota: A chamada real via `fetch` foi substituída por um mock demonstrativo neste repositório para proteção de chaves de API).*

##   Próximos Passos: Evolução para Arquitetura RAG
O escopo atual funciona como uma Prova de Conceito (PoC) com um banco de dados embarcado. A arquitetura futura prevê a transição para **Retrieval-Augmented Generatio (RAG)**:

1. Migrar a base para um banco de dados externo ou ITSM (como ServiceNow).
2. O motor local fará a consulta no banco, filtrando os serviços mais prováveis.
3. Injetar esse contexto limitado diretamente no *System Prompt* da inteligência artificial.
4. Isso permite escalar o chatbot para centenas de serviços (ex: os +450 da base completa) sem a necessidade de atualizar o código-fonte, reduzindo o custo de tokens e eliminando o risco de alucinações da IA.
