it('should be able to navigate to github.com', () => {
  cy.visit('https://github.com');
});

it('should be able to find the file extension on github.com', () => {
  cy.visit('https://github.com/NickSpaghetti/Salve-Amulet-Checker/blob/master/src/main/java/com/sac/SalveAmuletCheckerPlugin.java');
  cy.get('[class="final-path"]')
      .should('have.length',1)
      .then((currentSubject) => {
        cy.wrap(currentSubject[0].innerText).should('equal','SalveAmuletCheckerPlugin.java');
      });
});

it('should be able to find the java code on github.com', () => {
    cy.visit('https://github.com/NickSpaghetti/Salve-Amulet-Checker/blob/master/src/main/java/com/sac/SalveAmuletCheckerPlugin.java');
    cy.get('table')
        .should('have.length',1)
        .then((currentSubject) => {
            cy.wrap(currentSubject[0].innerText).should('not.be.empty');
        });
});
