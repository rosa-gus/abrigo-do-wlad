import reveal from "../../Reveal.module.css";
import { useSectionReveal } from "../../useSectionReveal";
import * as Lucide from "lucide-react";
import styles from "./ActionCards.module.css";
import { Link } from "react-router";
import { analytics } from "@/utils/analytics";

import * as Card from "@jaci/ui/Card";
import * as Dialog from "@jaci/ui/Dialog";
import PixModal from "@/components/PixModal";


export function ActionCards() {
  const { sectionRef, isVisible } = useSectionReveal();

  return (
    <section className={styles.cardsContainer} ref={sectionRef}>
      {/* adoption */}
      <Card.Card
        tone="danger"
        interactive
        className={`${reveal.item} ${isVisible ? reveal.visible : ""}`}
      >
        <Card.CardBody>
          <Card.CardHeader>
            <Card.CardIcon>
              <Lucide.Heart size={38} strokeWidth={1.5} />
            </Card.CardIcon>
            <Card.CardTitle>Adoção responsável</Card.CardTitle>
          </Card.CardHeader>
          <Card.CardContent>
            <p>
              Nossos animais são entregues{" "}
              <strong>castrados e vacinados</strong>. Adotar é um compromisso de
              amor para a vida toda.
            </p>
          </Card.CardContent>
        </Card.CardBody>
        <Card.CardFooter>
          <Link to="/caes">
            <Card.CardButton>
              Conheça nossos cães <Lucide.ChevronRight size={20} />
            </Card.CardButton>
          </Link>
        </Card.CardFooter>
      </Card.Card>

      {/* donations & pix modal */}
      <Card.Card
        interactive
        className={`${reveal.item} ${styles.cardDelay1} ${isVisible ? reveal.visible : ""}`}
      >
        <Card.CardBody>
          <Card.CardHeader>
            <Card.CardIcon>
              <Lucide.HeartHandshake size={38} strokeWidth={1.5} />
            </Card.CardIcon>
            <Card.CardTitle>Faça uma doação</Card.CardTitle>
          </Card.CardHeader>
          <Card.CardContent>
            <p>
              Mantemos o abrigo <strong>100% com doações</strong>. Sua ajuda
              garante ração e remédios.
            </p>
          </Card.CardContent>
        </Card.CardBody>
        <Card.CardFooter>
          <Dialog.Dialog>
            <Dialog.DialogTrigger asChild>
              <Card.CardButton onClick={() => analytics.trackConversionIntent("donation")}>
                Doação via Pix
                <Lucide.ChevronUp size={20} />
              </Card.CardButton>
            </Dialog.DialogTrigger>
            <PixModal />
          </Dialog.Dialog>
        </Card.CardFooter>
      </Card.Card>

      {/* tampinhas */}
      <Card.Card
        tone="success"
        interactive
        className={`${reveal.item} ${styles.cardDelay2} ${isVisible ? reveal.visible : ""}`}
      >
        <Card.CardBody>
          <Card.CardHeader>
            <Card.CardIcon>
              <Lucide.Recycle size={38} strokeWidth={1.5} />
            </Card.CardIcon>
            <Card.CardTitle>Projeto Tampinhas</Card.CardTitle>
          </Card.CardHeader>
          <Card.CardContent>
            <p>
              <strong>Não jogue fora!</strong> Suas tampinhas de plástico
              financiam a ração e os medicamentos dos nossos resgatados.
            </p>
          </Card.CardContent>
        </Card.CardBody>
        <Card.CardFooter>
          <Link to="/tampinhas">
            <Card.CardButton>
              Ver pontos de coleta <Lucide.ChevronRight size={20} />
            </Card.CardButton>
          </Link>
        </Card.CardFooter>
      </Card.Card>
    </section>
  );
}
