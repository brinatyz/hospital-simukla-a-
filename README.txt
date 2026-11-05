HOSPITAL SEM LOTACAO - COMO INICIAR

1. Extraia todo o conteudo do arquivo ZIP para uma pasta.
2. Verifique se o Node.js esta instalado no computador.
3. No Windows, de dois cliques em iniciar.bat.
4. Uma janela preta sera aberta. Aguarde o navegador abrir em http://localhost:3000.
5. Mantenha a janela preta aberta enquanto usar o site. Para encerrar, pressione Ctrl+C nela.

IMPORTANTE
- Nao abra o index.html diretamente e nao use apenas o Live Server do VS Code.
- A previsao com IA precisa do servidor Node.js. Se usar Live Server, a tela pode nao conseguir acessar as rotas /api.
- Se preferir iniciar pelo terminal do VS Code, abra esta pasta e execute: node server.js
  Depois acesse http://localhost:3000 no navegador.
- O projeto ja carrega uma base de demonstracao sintetica e treina o modelo ao iniciar.
- Na tela Simular cenario, os campos podem ser alterados para testar cenarios diferentes.
- A base de demonstracao e simulada, nao representa dados reais de hospitais. Para uso real, seria necessario importar dados reais, anonimizados e autorizados, e validar o modelo.

TECNOLOGIA
Node.js (modulos nativos), HTML, CSS, JavaScript e modelo de regressao linear multipla treinado com dados historicos. Nao precisa executar npm install.
