/** Кто попадает в сетку: все заявленные в категорию, кроме убранных и перевеса. Взвешивание не обязательно. */
export const IN_BRACKET = ["ENTERED", "ADMITTED"];
export const inBracket = (status: string) => IN_BRACKET.includes(status);
