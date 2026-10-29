import reveal from "../../Reveal.module.css";
import { useSectionReveal } from "../../useSectionReveal";
import * as Lucide from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@jaci/ui/Accordion";

import styles from "./FaqSection.module.css";
import { Button } from "@jaci/ui/Button";
import { Badge } from "@jaci/ui/Badge";
import {
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  CardIcon,
  CardTitle,
} from "@jaci/ui/Card";
import { Link } from "react-router";

import { ExternalLink } from "@/components/common/ExternalLink";
import { SHELTER_INSTAGRAM_URL } from "@/utils/links";

export function FaqSection() {
  const { sectionRef, isVisible } = useSectionReveal();

  return (
    <section id="faq" ref={sectionRef}>
      <div className={`${styles.titleFaq} ${reveal.item} ${isVisible ? reveal.visible : ""}`}>
        <h2 className="section-title">Você pode estar se perguntando...</h2>
        <p>Algumas respostas para perguntas frequentes.</p>
      </div>
      <Accordion
        type="single"
        collapsible
        className={`${styles.accordionWrapper} ${reveal.item} ${isVisible ? reveal.visible : ""}`}
      >
        <AccordionItem value="item-1" className={styles.faqItem}>
          <AccordionTrigger>Vocês fazem resgate de animais?</AccordionTrigger>
          <AccordionContent>
            <div className={styles.faqContainer}>
              <p>
                A responsabilidade pelo resgate é do{" "}
                <strong>poder público</strong>. O{" "}
                <strong>Abrigo do Wlad</strong> está lotado e sem condições de
                receber novos animais. Mas você pode ajudar: leve o animal ao
                veterinário, vacine, vermifugue, castre (ou busque castração
                social), tire boas fotos, divulgue para adoção em redes sociais
                e eventos da região e crie vaquinhas ou rifas para cobrir os
                custos — assim você dá ao animal a mesma chance que damos aos
                nossos resgatados!
              </p>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="item-2" className={styles.faqItem}>
          <AccordionTrigger>Posso visitar o abrigo?</AccordionTrigger>
          <AccordionContent>
            <div className={styles.faqContainer}>
              <p>Sim! <strong>As visitas precisam ser agendadas com antecedência.</strong></p>
              <div className={styles.visitOptions}>
                <Card size="sm" tone="muted" className={styles.visitPanel}>
                  <CardBody className={styles.panelBody}>
                    <CardHeader className={styles.panelHeading}>
                      <CardIcon>
                        <Lucide.Calendar size={32} strokeWidth={1.5} aria-hidden="true" />
                      </CardIcon>
                      <CardTitle>Conhecer o abrigo</CardTitle>
                    </CardHeader>
                    <div className={styles.visitSchedule}>
                      <Badge variant="outline">Segunda a sábado</Badge>
                      <Badge variant="outline">14h às 17h</Badge>
                    </div>
                    <Badge
                      variant="danger"
                      leftIcon={<Lucide.CalendarOff size={16} aria-hidden="true" />}
                      className={styles.scheduleBadge}
                    >
                      Não realizamos visitas em feriados
                    </Badge>
                    <p>
                      Para conhecer o espaço ou trazer doações, combine sua
                      visita por e-mail ou Instagram.
                    </p>
                  </CardBody>
                  <CardFooter>
                    <div className={styles.visitActions}>
                      <ExternalLink href="mailto:abrigodowlad@gmail.com">
                        <Button
                          size="sm"
                          variant="secondary"
                          leftIcon={<Lucide.Mail size={18} aria-hidden="true" />}
                        >
                          E-mail
                        </Button>
                      </ExternalLink>
                      <ExternalLink href={SHELTER_INSTAGRAM_URL}>
                        <Button
                          size="sm"
                          variant="secondary"
                          leftIcon={<Lucide.Instagram size={18} aria-hidden="true" />}
                        >
                          Instagram
                        </Button>
                      </ExternalLink>
                    </div>
                  </CardFooter>
                </Card>

                <Card size="sm" tone="muted" className={styles.visitPanel}>
                  <CardBody className={styles.panelBody}>
                    <CardHeader className={styles.panelHeading}>
                      <CardIcon>
                        <Lucide.Dog size={32} strokeWidth={1.5} aria-hidden="true" />
                      </CardIcon>
                      <CardTitle>Visita para adoção</CardTitle>
                    </CardHeader>
                    <p>
                      <strong>O primeiro passo é preencher o formulário.</strong>{" "}
                      Nossa equipe analisa a compatibilidade entre seu perfil e
                      o do cão. Se houver compatibilidade, entramos em contato
                      para combinar a visita.
                    </p>
                  </CardBody>
                  <CardFooter>
                    <Link to="/formulario">
                      <Button
                        size="sm"
                        tabIndex={-1}
                        variant="primary"
                        leftIcon={<Lucide.FilePenLine size={16} aria-hidden="true" />}
                      >
                        Preencher formulário
                      </Button>
                    </Link>
                  </CardFooter>
                </Card>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="item-3" className={styles.faqItem}>
          <AccordionTrigger>
            Como funciona o processo de adoção?
          </AccordionTrigger>
          <AccordionContent>
            <div className={styles.faqContainer}>
              <p>
                Buscamos o cãozinho que combina com sua rotina e família, não
                apenas pelo visual — isso evita frustrações e devoluções. O
                processo começa com um <strong>questionário</strong> (avaliamos
                perfil, experiência e disponibilidade), seguido de{" "}
                <strong>entrevista via WhatsApp</strong> e, por fim,{" "}
                <strong>visita presencial</strong> ao abrigo para conhecer o
                animal.
              </p>

              <p>
                <strong>Importante:</strong> Há taxa de adoção. Não reservamos
                animais nem fazemos adoção por terceiros. Resposta em até 3 dias
                úteis.
              </p>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </section>
  );
}
