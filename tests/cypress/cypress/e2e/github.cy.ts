it('should be able to navigate to github.com', () => {
    cy.clearAllCookies()
    cy.clearLocalStorage()
    cy.visit('https://github.com');
});

it('should be able to find the file extension on github.com from url', () => {
    cy.visit('https://github.com/NickSpaghetti/Salve-Amulet-Checker/blob/master/src/main/java/com/sac/SalveAmuletCheckerPlugin.java');
    cy.url({ decode: true }).should('contain', '.java')
});


it('find java code', () => {
    cy.visit('https://github.com/NickSpaghetti/Salve-Amulet-Checker/blob/master/src/main/java/com/sac/SalveAmuletCheckerPlugin.java');
    cy.get("#read-only-cursor-text-area")
        .should('not.be.undefined')

});

it('find data-code-text', () => {
    cy.visit('https://github.com/NickSpaghetti/terraform-up-and-running-3rd-edition/blob/main/Chapters/6/main.tf');
    cy.get('span[data-code-test*="hashicorp/aws"]')
        .should('not.be.undefined')

});

it('read-only-cursor-text-area has z-index 1 style', () => {
    cy.visit('https://github.com/NickSpaghetti/terraform-up-and-running-3rd-edition/blob/main/Chapters/6/main.tf');
    cy.get('#read-only-cursor-text-area')
        .should('not.be.undefined')
        .should('have.css','z-index','1');

});



