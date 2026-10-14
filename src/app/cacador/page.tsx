import type { Metadata } from "next";
import Cacador from "@/components/Cacador";

export const metadata: Metadata = {
  title: "Caçador de fornecedores",
  description:
    "Cotações de fornecedores avaliadas pelo mesmo cálculo da calculadora de margem, com teto de FOB, ranking e rascunho de RFQ.",
};

export default function Page() {
  return <Cacador />;
}
