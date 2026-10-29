import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
export class RegisterDto {
  @ApiProperty() @IsString() @Length(2, 100) name!: string;
  @ApiProperty() @IsEmail() @MaxLength(254) email!: string;
  @ApiProperty({ minLength: 12, maxLength: 128 })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;
}
export class LoginDto {
  @ApiProperty() @IsEmail() @MaxLength(254) email!: string;
  @ApiProperty() @IsString() @Length(1, 128) password!: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^\d{6}$/) totp?: string;
  @ApiPropertyOptional({ description: 'One single-use recovery code, instead of totp.' })
  @IsOptional()
  @IsString()
  @Matches(/^(?:[a-fA-F0-9]{32}|(?:[a-fA-F0-9]{4}-){7}[a-fA-F0-9]{4})$/)
  recoveryCode?: string;
}
export class EmailDto {
  @ApiProperty() @IsEmail() @MaxLength(254) email!: string;
}
export class TokenDto {
  @ApiProperty() @IsString() @Length(32, 128) token!: string;
}
export class ResetDto extends TokenDto {
  @ApiProperty({ minLength: 12 }) @IsString() @Length(12, 128) password!: string;
}
export class TotpDto {
  @ApiProperty() @Matches(/^\d{6}$/) code!: string;
}
export class UserIdentityDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() name!: string;
  @ApiProperty() organizationId!: string;
  @ApiProperty() membershipId!: string;
  @ApiProperty({ type: [String] }) roles!: string[];
  @ApiProperty() verified!: boolean;
  @ApiProperty() mfaEnabled!: boolean;
  @ApiProperty() timezone!: string;
  @ApiProperty() locale!: string;
}
export class SessionDto {
  @ApiProperty({ type: UserIdentityDto }) user!: UserIdentityDto;
  @ApiProperty() csrfToken!: string;
  @ApiProperty() mfaRequired!: boolean;
}
export class MessageDto {
  @ApiProperty() message!: string;
}
export class DeliveryDto {
  @ApiProperty({ enum: ['email', 'local-inbox'] }) mode!: 'email' | 'local-inbox';
  @ApiPropertyOptional({ description: 'Local Mailpit inbox, exposed only in local development.' })
  inboxUrl?: string;
}
export class MfaSetupDto {
  @ApiProperty({
    description:
      'Display once for manual authenticator setup; never log or persist in browser storage.',
  })
  secret!: string;
  @ApiProperty() uri!: string;
}
export class GenerateRecoveryCodesDto {
  @ApiProperty({ description: 'Re-enter the current account password.' })
  @IsString()
  @Length(1, 128)
  password!: string;
}
export class RecoveryCodesDto {
  @ApiProperty({
    type: [String],
    description: 'Shown once. Save securely; these replace every previously generated code.',
  })
  codes!: string[];
  @ApiProperty({ type: String, format: 'date-time' }) generatedAt!: string;
}
