import * as React from "react";
import * as Lucide from "lucide-react";
import { useCopyToClipboard } from "@uidotdev/usehooks";

import * as Dialog from "@jaci/ui/Dialog";
import { Button } from "@jaci/ui/Button";
import { ScrollArea } from "@jaci/ui/ScrollArea";
import { analytics } from "@/utils/analytics";

import qrCodePix from "@/assets/images/pix-qr-code.png";
import giftSticker from "@/assets/stickers/fluent-emoji/gift.svg";
import styles from "./PixModal.module.css";

export default function PixModal() {
  const [, copyToClipboard] = useCopyToClipboard();
  const [isCopied, setIsCopied] = React.useState(false);
  const pixKey = "abrigodowlad@gmail.com";

  const handleCopyClick = () => {
    copyToClipboard(pixKey);
    setIsCopied(true);
    analytics.trackConversionIntent("donation", { method: "pix_key_copy" });
    setTimeout(() => {
      setIsCopied(false);
    }, 2000);
  };

  return (
    <Dialog.DialogContent size="fullscreen-mobile">
      <Dialog.DialogHeader className={styles.modalHeader}>
        <Dialog.DialogIcon className={styles.modalIcon}>
          <img
            className={styles.headerSticker}
            src={giftSticker}
            alt=""
            width={48}
            height={48}
          />
        </Dialog.DialogIcon>
        <Dialog.DialogHeading className={styles.modalHeading}>
          <Dialog.DialogTitle>
            Faça uma doação via Pix
          </Dialog.DialogTitle>
          <Dialog.DialogDescription>
            Sua contribuição ajuda a garantir ração, medicamentos e cuidados
            para os cães do abrigo.
          </Dialog.DialogDescription>
        </Dialog.DialogHeading>
      </Dialog.DialogHeader>
      <ScrollArea className={styles.pixScrollArea} showScrollShadows>
        <div className={styles.pixModalContainer}>
          <figure className={styles.qrCodeWrapper}>
            <figcaption className={styles.scanHeading}>
              <Lucide.Camera size={22} aria-hidden="true" />
              <strong>Escaneie para doar</strong>
            </figcaption>
            <div className={styles.qrCodeFrame}>
              <span className={styles.cornerTopLeft} aria-hidden="true" />
              <span className={styles.cornerTopRight} aria-hidden="true" />
              <span className={styles.cornerBottomLeft} aria-hidden="true" />
              <span className={styles.cornerBottomRight} aria-hidden="true" />
              <img src={qrCodePix} alt="Código QR para doação via Pix" />
            </div>
            <p className={styles.scanInstruction}>
              Abra o app do seu banco, escolha <strong>Pix</strong> e depois{" "}
              <strong>Ler QR Code</strong>.
            </p>
          </figure>

          {/* clipboard pix key */}
          <div className={styles.pixCard}>
            <div>
              <p>Copiar chave Pix</p>
              <span>Clique para copiar</span>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleCopyClick}
              disabled={isCopied}
            >
              {isCopied ? (
                <>
                  <Lucide.Check size={20} />
                  Copiado!
                </>
              ) : (
                <>
                  <Lucide.Copy size={20} />
                  {pixKey}
                </>
              )}
            </Button>
          </div>

          {/* beneficiary data */}
          <div>
            <ul className={styles.beneficiaryData}>
              <li>
                <strong>Beneficiário:</strong> WLADMIR MARTINS DA CRUZ
              </li>
              <li>
                <strong>CPF:</strong> 137.451.868-93
              </li>
              <li>
                <strong>Banco:</strong> 237 - Bradesco
              </li>
              <li>
                <strong>Agência:</strong> 0118
              </li>
              <li>
                <strong>Conta corrente:</strong> 0136878-8
              </li>
            </ul>
          </div>
        </div>
      </ScrollArea>
    </Dialog.DialogContent>
  );
}
