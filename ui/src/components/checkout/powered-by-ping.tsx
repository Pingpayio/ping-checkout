import PingLogo from '@/assets/logos/PING.png';

export const PoweredByPing = () => (
  <div className="flex items-center justify-center gap-1">
    <span className="text-xs font-normal text-muted-foreground">Powered by</span>
    <div className="w-[54px] h-[15px] flex items-center justify-center">
      <img src={PingLogo} alt="PING" className="h-full object-contain" />
    </div>
  </div>
);