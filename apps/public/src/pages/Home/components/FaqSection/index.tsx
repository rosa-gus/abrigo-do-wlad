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
    <section id="faq" ref={sectionRef} className={styles.faqSection} aria-labelledby="faq-title">
      <div className={`${styles.titleFaq} ${reveal.item} ${isVisible ? reveal.visible : ""}`}>
        <h2 id="faq-title" className="section-title">Ficou com alguma dúvida?</h2>
        <p>Veja algumas respostas sobre o abrigo e a adoção.</p>
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
                No momento, o abrigo está lotado e não consegue receber novos animais.
              </p>
              <p>
                O Abrigo do Wlad é um projeto independente e não substitui os
                serviços públicos de proteção animal. Para orientações e
                solicitações de atendimento, procure os órgãos responsáveis do
                seu município. O atendimento depende dos critérios de cada serviço.
              </p>
              <div>
                <h4 className={styles.helpTitle}>Como você pode ajudar</h4>
                <ul className={styles.rescueHelpList}>
                  <li>Busque atendimento veterinário para avaliar os cuidados necessários.</li>
                  <li>Divulgue o animal com boas fotos e informações para encontrar um lar.</li>
                  <li>Mobilize uma rede de apoio para ajudar com os cuidados e custos.</li>
                </ul>
              </div>
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
              <ol className={styles.adoptionFlow} aria-label="Etapas da adoção">
                <li className={styles.flowStep}>
                  <span className={styles.stepNumber} aria-hidden="true">1</span>
                  <div>
                    <h4>Preencha o formulário</h4>
                    <p>Conte sobre sua rotina e sua família.</p>
                  </div>
                  <Lucide.ArrowDown className={styles.flowArrow} size={20} aria-hidden="true" />
                </li>
                <li className={styles.flowStep}>
                  <span className={styles.stepNumber} aria-hidden="true">2</span>
                  <div>
                    <h4>Converse com a equipe</h4>
                    <p>Entrevista pelo WhatsApp para avaliar a compatibilidade.</p>
                  </div>
                  <Lucide.ArrowDown className={styles.flowArrow} size={20} aria-hidden="true" />
                </li>
                <li className={styles.flowStep}>
                  <span className={styles.stepNumber} aria-hidden="true">3</span>
                  <div>
                    <h4>Conheça o cão no abrigo</h4>
                    <p>Visita agendada após a avaliação.</p>
                  </div>
                </li>
              </ol>
              <div className={styles.flowFooter}>
                <p className={styles.adoptionFee}>
                  <Lucide.Info size={18} aria-hidden="true" />
                  <strong>Há taxa de adoção.</strong>
                </p>
                <p>Não fazemos reservas nem adoções por terceiros. O prazo de resposta é de até 3 dias úteis.</p>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </section>
  );
}
