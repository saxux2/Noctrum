import { Composer } from "grammy";
import start from "./start";
import wallet from "./wallet";
import lend from "./lend";
import borrow from "./borrow";
import loans from "./loans";
import transfer from "./transfer";
import swap from "./swap";
import info from "./info";
import help from "./help";

const commands = new Composer();

commands.use(start);
commands.use(wallet);
commands.use(lend);
commands.use(borrow);
commands.use(loans);
commands.use(transfer);
commands.use(swap);
commands.use(info);
commands.use(help);

export default commands;
