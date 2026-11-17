import importlib.util
from pathlib import Path
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'migrate-env.py'
SPEC = importlib.util.spec_from_file_location('migrate_env', SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class ConfigurationMigrationTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / '.env'

    def test_preserves_credentials_and_original_without_exposing_them(self):
        original = ('POSTGRES_USER=student\nPOSTGRES_PASSWORD="private#with spaces"\n'
                    'POSTGRES_DB=practical\nDATABASE_URL=postgres://old-url\n'
                    'SESSION_SECRET=old-secret\nAWS_SECRET_ACCESS_KEY=storage-secret\n'
                    'S3_PUBLIC_ENDPOINT=http://localhost:9100\nMAX_UPLOAD_MB=10\n')
        self.path.write_text(original)
        self.assertTrue(MODULE.migrate(self.path))
        result = self.path.read_text()
        self.assertIn('MYSQL_USER=student\n', result)
        self.assertIn('MYSQL_PASSWORD="private#with spaces"\n', result)
        self.assertIn('MYSQL_DATABASE=practical\n', result)
        self.assertIn('AWS_SECRET_ACCESS_KEY=storage-secret\n', result)
        self.assertNotIn('DATABASE_URL=', result)
        self.assertNotIn('POSTGRES_', result)
        self.assertNotIn('SESSION_SECRET=', result)
        self.assertEqual(self.path.with_name('.env.before-php-mysql').read_text(), original)
        self.assertEqual(self.path.stat().st_mode & 0o777, 0o600)
        self.assertEqual(self.path.with_name('.env.before-php-mysql').stat().st_mode & 0o777, 0o600)

    def test_repeated_run_is_a_noop(self):
        self.path.write_text('POSTGRES_USER=app\nPOSTGRES_PASSWORD=private\nPOSTGRES_DB=appdb\n')
        MODULE.migrate(self.path)
        first = self.path.read_text()
        self.assertFalse(MODULE.migrate(self.path))
        self.assertEqual(self.path.read_text(), first)

    def test_existing_mysql_credentials_take_precedence(self):
        self.path.write_text('POSTGRES_USER=old\nPOSTGRES_PASSWORD=old-password\n'
                             'MYSQL_USER=new\nMYSQL_PASSWORD=new-password\n')
        MODULE.migrate(self.path)
        result = self.path.read_text()
        self.assertIn('MYSQL_USER=new\n', result)
        self.assertIn('MYSQL_PASSWORD=new-password\n', result)
        self.assertNotIn('old-password', result)
        self.assertEqual(result.count('MYSQL_USER='), 1)

    def test_existing_backup_is_never_overwritten(self):
        self.path.write_text('POSTGRES_USER=app\n')
        backup = self.path.with_name('.env.before-php-mysql')
        backup.write_text('important original')
        with self.assertRaises(RuntimeError):
            MODULE.migrate(self.path)
        self.assertEqual(self.path.read_text(), 'POSTGRES_USER=app\n')
        self.assertEqual(backup.read_text(), 'important original')

    def test_new_passwords_are_distinct(self):
        self.path.write_text('AWS_ACCESS_KEY_ID=preserved\n')
        MODULE.migrate(self.path)
        values = dict(line.split('=', 1) for line in self.path.read_text().splitlines())
        self.assertEqual(values['AWS_ACCESS_KEY_ID'], 'preserved')
        self.assertNotEqual(values['MYSQL_PASSWORD'], values['MYSQL_ROOT_PASSWORD'])
        self.assertGreaterEqual(len(values['MYSQL_PASSWORD']), 32)


if __name__ == '__main__':
    unittest.main()
